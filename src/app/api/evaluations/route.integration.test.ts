import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
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
