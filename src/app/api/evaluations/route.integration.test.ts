import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { decryptField, isEncryptedToken } from "@/lib/field-crypto";
import { GET, POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestUser,
} from "@/test/db-helpers";

// next-authのauth()はミドルウェアとしても呼べるよう複数のオーバーロードを持ち、
// そのままではmockResolvedValue()が型エラーになるため、テストで実際に
// 使う「セッション取得関数」としての形に絞って再キャストする。
const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockParse = vi.mocked(anthropic.messages.parse);

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function request(body: unknown) {
  return new Request("http://localhost/api/evaluations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/evaluations", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const prompt = await createTestPrompt(userId, "この画像を評価してください");
    promptId = prompt.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockParse.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには400を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("対応していない画像形式には400を返す", async () => {
    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/svg+xml",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("画像サイズの上限(base64換算)を超えると400を返す", async () => {
    // クライアント側の5MB上限をbase64文字数に換算した値をわずかに超えるダミー文字列。
    const oversized = "A".repeat(Math.ceil((5 * 1024 * 1024) / 3) * 4 + 4);
    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: oversized,
        imageMediaType: "image/png",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("成功時はPENDINGで202を返し、バックグラウンドでClaudeの評価どおりにEvaluationFindingを作成する", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        summary: "彩り豊かで美味しそうです",
        findings: [
          { label: "彩り", tone: "POSITIVE", score: 90, body: "..." },
          { label: "栄養バランス", tone: "SUGGESTION", score: null, body: "..." },
        ],
      },
      usage: { input_tokens: 200, output_tokens: 80 },
    } as never);

    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
      }),
    );
    // 実際のAI呼び出しはバックグラウンド実行(scheduleBackground)のため、
    // レスポンス自体は作成直後のPENDINGを返す(next/serverのafter()はNextの
    // リクエストスコープ外であるテスト環境では例外を投げ、scheduleBackground が
    // その場でtaskを待ってから返すため、この時点でDBへの反映は完了している)。
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("PENDING");

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: body.id },
      include: { findings: true },
    });
    expect(evaluation?.status).toBe("SUCCESS");
    expect(evaluation?.inputType).toBe("IMAGE");
    expect(evaluation?.findings).toHaveLength(2);
    expect(evaluation?.findings[0].label).toBe("彩り");

    // 総評・観点別コメントは暗号化して保存され、復号すると元の値に戻る。
    expect(evaluation?.summary).not.toBeNull();
    expect(isEncryptedToken(evaluation!.summary!)).toBe(true);
    expect(decryptField(evaluation!.summary!)).toBe("彩り豊かで美味しそうです");
    expect(isEncryptedToken(evaluation!.findings[0].body)).toBe(true);
    expect(decryptField(evaluation!.findings[0].body)).toBe("...");

    // Execution.resultTextには実際の総評・コメントの平文を残さない
    // (共有列のため暗号化が及ばない箇所からの情報漏えいを避けるため)。
    const execution = await prisma.execution.findUnique({
      where: { id: evaluation!.executionId! },
    });
    expect(execution?.resultText).not.toContain("彩り豊かで美味しそうです");

    const notification = await prisma.notification.findFirst({
      where: { userId, link: `/evaluations/${body.id}` },
    });
    expect(notification?.message).toBe("評価「夕食」が完了しました");

    // Claudeにはbase64画像とプロンプト本文の両方を渡している
    const call = mockParse.mock.calls[0][0];
    const content = (call.messages[0].content ?? []) as {
      type: string;
    }[];
    expect(content.some((b) => b.type === "image")).toBe(true);
    expect(content.some((b) => b.type === "text")).toBe(true);
  });

  it("AI呼び出し失敗時はバックグラウンドでEvaluationをFAILEDにする", async () => {
    mockParse.mockRejectedValue(new Error("upstream boom"));

    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
      }),
    );
    expect(res.status).toBe(202);

    const { id: evaluationId } = await res.json();
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });
    expect(evaluation?.status).toBe("FAILED");

    const notification = await prisma.notification.findFirst({
      where: { userId, link: `/evaluations/${evaluationId}` },
    });
    expect(notification?.message).toBe("評価「夕食」の実行に失敗しました");
  });

  it("inputType: TEXTを指定すると{{変数名}}を展開してテキストとしてClaudeに渡す", async () => {
    const textPrompt = await createTestPrompt(
      userId,
      "この歌詞を評価してください: {{lyrics}}",
    );

    mockParse.mockResolvedValue({
      parsed_output: {
        summary: "情感豊かな歌詞です",
        findings: [{ label: "情感", tone: "POSITIVE", score: 85, body: "..." }],
      },
      usage: { input_tokens: 50, output_tokens: 30 },
    } as never);

    const res = await POST(
      request({
        title: "自作曲",
        promptId: textPrompt.id,
        inputType: "TEXT",
        variables: { lyrics: "夜空に願いを込めて" },
      }),
    );
    expect(res.status).toBe(202);
    const { id: evaluationId } = await res.json();

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { findings: true },
    });
    expect(evaluation?.status).toBe("SUCCESS");
    expect(evaluation?.inputType).toBe("TEXT");
    expect(evaluation?.findings).toHaveLength(1);

    // {{lyrics}}が実際の値に展開された文字列がそのままClaudeに渡っている
    // (画像評価と異なりcontent配列ではなく文字列のまま)
    const call = mockParse.mock.calls[0][0];
    expect(call.messages[0].content).toBe(
      "この歌詞を評価してください: 夜空に願いを込めて",
    );
  });

  it("inputType: TEXTでは画像を指定しなくても400にならない", async () => {
    const textPrompt = await createTestPrompt(userId, "この文章を評価してください: {{text}}");
    mockParse.mockResolvedValue({
      parsed_output: { summary: "ok", findings: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never);

    const res = await POST(
      request({
        title: "エッセイ",
        promptId: textPrompt.id,
        inputType: "TEXT",
        variables: { text: "今日は良い天気でした" },
      }),
    );
    expect(res.status).toBe(202);
  });

  it("inputType: PDFでPDFファイルを指定しないと400を返す", async () => {
    const res = await POST(
      request({ title: "契約書", promptId, inputType: "PDF" }),
    );
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("PDFサイズの上限(base64換算)を超えると400を返す", async () => {
    const oversized = "A".repeat(Math.ceil((20 * 1024 * 1024) / 3) * 4 + 4);
    const res = await POST(
      request({
        title: "契約書",
        promptId,
        inputType: "PDF",
        pdfBase64: oversized,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("inputType: PDFを指定するとdocumentブロックとしてClaudeに渡す", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        summary: "要点を整理しました",
        findings: [{ label: "第3条", tone: "SUGGESTION", score: null, body: "..." }],
      },
      usage: { input_tokens: 300, output_tokens: 100 },
    } as never);

    const res = await POST(
      request({
        title: "契約書",
        promptId,
        inputType: "PDF",
        pdfBase64: "JVBERi0xLjQK",
      }),
    );
    expect(res.status).toBe(202);
    const { id: evaluationId } = await res.json();

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { findings: true },
    });
    expect(evaluation?.status).toBe("SUCCESS");
    expect(evaluation?.inputType).toBe("PDF");
    expect(evaluation?.findings).toHaveLength(1);

    const call = mockParse.mock.calls[0][0];
    const content = (call.messages[0].content ?? []) as {
      type: string;
      source?: { media_type?: string };
    }[];
    const documentBlock = content.find((b) => b.type === "document");
    expect(documentBlock?.source?.media_type).toBe("application/pdf");
    expect(content.some((b) => b.type === "text")).toBe(true);
  });

  it("batchIdを指定すると個別通知の代わりにバッチ完了時のまとめ通知が1回だけ作られる", async () => {
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 2 },
    });

    mockParse.mockResolvedValue({
      parsed_output: { summary: "ok", findings: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never);

    const res1 = await POST(
      request({
        title: "1件目",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
        batchId: batch.id,
      }),
    );
    const { id: id1 } = await res1.json();

    const res2 = await POST(
      request({
        title: "2件目",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
        batchId: batch.id,
      }),
    );
    const { id: id2 } = await res2.json();

    // バッチに属する個々のEvaluationは通知センターを埋めないよう、個別通知を作らない。
    expect(
      await prisma.notification.findFirst({ where: { userId, link: `/evaluations/${id1}` } }),
    ).toBeNull();
    expect(
      await prisma.notification.findFirst({ where: { userId, link: `/evaluations/${id2}` } }),
    ).toBeNull();

    const batchNotifications = await prisma.notification.findMany({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(batchNotifications).toHaveLength(1);
    expect(batchNotifications[0].message).toBe("バッチ評価(2件)が完了しました(成功2件)");
  });

  it("バッチ内の1件が失敗しても、まとめ通知は成功件数を正しく報告する", async () => {
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 2 },
    });

    mockParse
      .mockResolvedValueOnce({
        parsed_output: { summary: "ok", findings: [] },
        usage: { input_tokens: 1, output_tokens: 1 },
      } as never)
      .mockRejectedValueOnce(new Error("upstream boom"));

    await POST(
      request({
        title: "成功分",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
        batchId: batch.id,
      }),
    );
    await POST(
      request({
        title: "失敗分",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
        batchId: batch.id,
      }),
    );

    const batchNotification = await prisma.notification.findFirst({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(batchNotification?.message).toBe("バッチ評価(2件)が完了しました(成功1件)");
  });

  it("他ユーザーのbatchIdを指定すると400を返す", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other-${Date.now()}@example.test` },
    });
    const otherBatch = await prisma.evaluationBatch.create({
      data: { userId: otherUser.id, total: 2 },
    });

    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
        batchId: otherBatch.id,
      }),
    );
    expect(res.status).toBe(400);

    await prisma.evaluationBatch.deleteMany({ where: { userId: otherUser.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  it("評価系レート制限の上限に達すると429を返す", async () => {
    mockParse.mockResolvedValue({
      parsed_output: { summary: "ok", findings: [] },
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never);

    const hourMs = 60 * 60 * 1000;
    const windowStart = new Date(Math.floor(Date.now() / hourMs) * hourMs);
    await prisma.rateLimitBucket.create({
      data: { userId, windowStart, purpose: "evaluation", count: 20 },
    });

    const res = await POST(
      request({
        title: "夕食",
        promptId,
        imageBase64: TINY_PNG_BASE64,
        imageMediaType: "image/png",
      }),
    );
    expect(res.status).toBe(429);
  });
});

describe("GET /api/evaluations", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "この画像を評価してください");
    promptId = prompt.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("自分のEvaluationのみを新しい順で返す", async () => {
    const promptVersion = await prisma.promptVersion.findFirstOrThrow({
      where: { promptId },
    });
    await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "1件目",
        status: "SUCCESS",
      },
    });
    await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "2件目",
        status: "SUCCESS",
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("2件目");
  });
});
