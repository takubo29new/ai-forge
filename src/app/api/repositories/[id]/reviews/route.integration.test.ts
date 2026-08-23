import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
  getPullRequest: vi.fn(),
  getPullRequestDiff: vi.fn(),
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import {
  getGitHubClient,
  getPullRequest,
  getPullRequestDiff,
} from "@/lib/github";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

// next-authのauth()はミドルウェアとしても呼べるよう複数のオーバーロードを持ち、
// そのままではmockResolvedValue()が型エラーになるため、テストで実際に
// 使う「セッション取得関数」としての形に絞って再キャストする。
const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockParse = vi.mocked(anthropic.messages.parse);
const mockGetClient = vi.mocked(getGitHubClient);
const mockGetPR = vi.mocked(getPullRequest);
const mockGetDiff = vi.mocked(getPullRequestDiff);
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

function request(body: unknown) {
  return new Request("http://localhost/api/repositories/x/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/repositories/:id/reviews", () => {
  let userId: string;
  let repositoryId: string;
  let promptWithDiffId: string;
  let promptWithoutDiffId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const withDiff = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptWithDiffId = withDiff.id;
    const withoutDiff = await createTestPrompt(userId, "diffを含まない本文");
    promptWithoutDiffId = withoutDiff.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockParse.mockReset();
    mockGetClient.mockReset().mockResolvedValue({} as never);
    mockGetPR.mockReset().mockResolvedValue({
      number: 42,
      title: "Add feature",
      url: "https://github.com/octo-test/repo-test/pull/42",
      headSha: "abc123",
    });
    mockGetDiff.mockReset();
    mockEmbedDocuments.mockReset().mockResolvedValue([]);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("他ユーザーのリポジトリには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(404);
  });

  it("{{diff}}を含まないプロンプトには400を返す", async () => {
    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithoutDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(400);
  });

  it("成功時はClaudeの指摘どおりにReviewCommentを作成し201を返す", async () => {
    mockGetDiff.mockResolvedValue({
      diff: "diff --git a/x b/x",
      truncated: false,
    });
    mockParse.mockResolvedValue({
      parsed_output: {
        findings: [
          { filePath: "src/x.ts", line: 3, severity: "WARNING", body: "未使用の変数" },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);

    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(201);
    const { id: reviewId } = await res.json();

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { comments: true },
    });
    expect(review?.status).toBe("SUCCESS");
    expect(review?.comments).toHaveLength(1);
    expect(review?.comments[0].filePath).toBe("src/x.ts");

    // 新規に作成された指摘には都度埋め込みが生成される(RAG検索チャットの検索対象)
    const embedded = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "reviewCommentId" AS id FROM "ReviewCommentEmbedding"
      WHERE "reviewCommentId" = ${review!.comments[0].id}
    `;
    expect(embedded).toHaveLength(1);
  });

  it("diffが切り詰められた場合はReviewCommentに警告を残す", async () => {
    mockGetDiff.mockResolvedValue({
      diff: "diff --git a/x b/x (clipped)",
      truncated: true,
    });
    mockParse.mockResolvedValue({
      parsed_output: { findings: [] },
      usage: { input_tokens: 100, output_tokens: 10 },
    } as never);

    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    const { id: reviewId } = await res.json();

    const comments = await prisma.reviewComment.findMany({
      where: { reviewId },
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].filePath).toBe("(PR diff)");
    expect(comments[0].severity).toBe("WARNING");
  });

  it("AI呼び出し失敗時はReviewをFAILEDで作成し200を返す(201にしない)", async () => {
    mockGetDiff.mockResolvedValue({
      diff: "diff --git a/x b/x",
      truncated: false,
    });
    mockParse.mockRejectedValue(new Error("upstream boom"));

    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    const { id: reviewId } = await res.json();
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(review?.status).toBe("FAILED");
  });
});
