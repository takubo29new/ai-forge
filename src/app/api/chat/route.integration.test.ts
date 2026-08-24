import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { create: vi.fn() } },
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedQuery: vi.fn(),
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { embedQuery } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import {
  setDocumentChunkEmbedding,
  setExecutionEmbedding,
  setPromptVersionEmbedding,
  setReviewCommentEmbedding,
} from "@/lib/embeddings";
import { POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockCreate = vi.mocked(anthropic.messages.create);
const mockEmbedQuery = vi.mocked(embedQuery);

function request(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// 次元ごとにわずかに異なるベクトルを作り、コサイン距離で近さを制御できるようにする。
function vector(base: number, noise = 0): number[] {
  return Array.from({ length: 1024 }, (_, i) => base + (i === 1 ? noise : 0));
}

describe("POST /api/chat", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockCreate.mockReset();
    mockEmbedQuery.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(request({ question: "質問" }));
    expect(res.status).toBe(401);
  });

  it("質問が空なら400を返す", async () => {
    const res = await POST(request({ question: "" }));
    expect(res.status).toBe(400);
  });

  it("検索対象が無ければ回答生成をスキップして案内メッセージを返す", async () => {
    mockEmbedQuery.mockResolvedValue(vector(1));
    const res = await POST(request({ question: "質問" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("ドキュメント・レビュー両方から検索し、出典付きで回答を返す", async () => {
    const document = await prisma.document.create({
      data: {
        title: "db-design.md",
        content: "本文",
        sourceType: "MANUAL",
        userId,
        chunks: {
          create: [{ chunkIndex: 0, content: "RateLimitBucketはupsertでアトミックに更新する" }],
        },
      },
      include: { chunks: true },
    });
    await setDocumentChunkEmbedding(document.chunks[0].id, vector(1));

    const repo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(999), owner: "o", name: "r" },
    });
    const prompt = await prisma.prompt.create({
      data: {
        title: "review",
        userId,
        versions: { create: { versionNumber: 1, content: "レビュー: {{diff}}" } },
      },
      include: { versions: true },
    });
    const review = await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId: prompt.versions[0].id,
        pullRequestNumber: 7,
        pullRequestTitle: "Fix bug",
        pullRequestUrl: "https://github.com/o/r/pull/7",
        headSha: "abc",
        status: "SUCCESS",
        comments: {
          create: [{ filePath: "src/x.ts", severity: "WARNING", body: "未使用の変数があります" }],
        },
      },
      include: { comments: true },
    });
    await setReviewCommentEmbedding(review.comments[0].id, vector(1, 0.01));

    mockEmbedQuery.mockResolvedValue(vector(1));
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "RateLimitBucketはupsertで更新されます[出典1]" }],
    } as never);

    const res = await POST(request({ question: "RateLimitBucketの実装は?" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.answer).toContain("RateLimitBucket");
    expect(body.sources.length).toBeGreaterThan(0);
    // 埋め込みが完全一致(距離0)のdocument_chunkの方が、わずかにノイズを乗せた
    // review_commentより先に来るはず
    expect(body.sources[0].kind).toBe("document_chunk");

    const promptSent = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptSent).toContain("RateLimitBucketはupsertでアトミックに更新する");
  });

  it("プロンプトバージョン・実行結果からも検索し、出典付きで回答を返す", async () => {
    const prompt = await prisma.prompt.create({
      data: {
        title: "要約用プロンプト",
        userId,
        versions: { create: { versionNumber: 1, content: "以下を要約して: {{text}}" } },
      },
      include: { versions: true },
    });
    await setPromptVersionEmbedding(prompt.versions[0].id, vector(1));

    const execution = await prisma.execution.create({
      data: {
        promptVersionId: prompt.versions[0].id,
        userId,
        model: "claude-test",
        resultText: "要約結果のテキスト",
        status: "SUCCESS",
      },
    });
    await setExecutionEmbedding(execution.id, vector(1, 0.01));

    mockEmbedQuery.mockResolvedValue(vector(1));
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "要約結果です[出典1]" }],
    } as never);

    const res = await POST(request({ question: "要約プロンプトの内容は?" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const kinds = body.sources.map((s: { kind: string }) => s.kind);
    expect(kinds).toContain("prompt_version");
    expect(kinds).toContain("execution");

    const promptVersionSource = body.sources.find(
      (s: { kind: string }) => s.kind === "prompt_version",
    );
    expect(promptVersionSource).toMatchObject({
      label: "要約用プロンプト",
      promptId: prompt.id,
    });

    const executionSource = body.sources.find(
      (s: { kind: string }) => s.kind === "execution",
    );
    expect(executionSource).toMatchObject({
      label: "要約用プロンプトの実行結果",
      promptId: prompt.id,
    });
  });
});
