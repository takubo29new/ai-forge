import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));
vi.mock("@/lib/github", () => ({
  getPullRequest: vi.fn(),
  getPullRequestDiff: vi.fn(),
  createPullRequestComment: vi.fn(),
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { anthropic } from "@/lib/anthropic";
import { getPullRequest, getPullRequestDiff, createPullRequestComment } from "@/lib/github";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { runRepositoryReview } from "@/lib/run-repository-review";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockParse = vi.mocked(anthropic.messages.parse);
const mockGetPR = vi.mocked(getPullRequest);
const mockGetDiff = vi.mocked(getPullRequestDiff);
const mockEmbedDocuments = vi.mocked(embedDocuments);
const mockCreateComment = vi.mocked(createPullRequestComment);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

describe("runRepositoryReview", () => {
  let userId: string;
  let repositoryId: string;
  let promptVersionId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const prompt = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptVersionId = prompt.versions[0].id;

    mockParse.mockReset();
    mockGetPR.mockReset().mockResolvedValue({
      number: 42,
      title: "Add feature",
      url: "https://github.com/octo-test/repo-test/pull/42",
      headSha: "abc123",
    });
    mockGetDiff.mockReset();
    mockEmbedDocuments.mockReset().mockResolvedValue([]);
    mockCreateComment.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  function call() {
    return runRepositoryReview({
      octokit: {} as never,
      repository: { id: repositoryId, owner: "octo-test", name: "repo-test" },
      userId,
      promptVersion: { id: promptVersionId, content: "レビューして: {{diff}}" },
      pullRequestNumber: 42,
      triggeredVia: "UI",
    });
  }

  it("成功時はClaudeの指摘どおりにReviewCommentと埋め込みを作成する", async () => {
    mockGetDiff.mockResolvedValue({ diff: "diff --git a/x b/x", truncated: false });
    mockParse.mockResolvedValue({
      parsed_output: {
        findings: [
          { filePath: "src/x.ts", line: 3, severity: "WARNING", body: "未使用の変数" },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);

    const result = await call();
    expect(result.status).toBe("SUCCESS");
    if (result.status === "FETCH_ERROR") throw new Error("unreachable");

    const review = await prisma.review.findUnique({
      where: { id: result.reviewId },
      include: { comments: true },
    });
    expect(review?.status).toBe("SUCCESS");
    expect(review?.comments).toHaveLength(1);
    expect(review?.comments[0].filePath).toBe("src/x.ts");
    expect(mockCreateComment).toHaveBeenCalledTimes(1);

    const embedded = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "reviewCommentId" AS id FROM "ReviewCommentEmbedding"
      WHERE "reviewCommentId" = ${review!.comments[0].id}
    `;
    expect(embedded).toHaveLength(1);
  });

  it("diffが切り詰められた場合はReviewCommentに警告を残す", async () => {
    mockGetDiff.mockResolvedValue({ diff: "diff --git a/x b/x (clipped)", truncated: true });
    mockParse.mockResolvedValue({
      parsed_output: { findings: [] },
      usage: { input_tokens: 100, output_tokens: 10 },
    } as never);

    const result = await call();
    if (result.status === "FETCH_ERROR") throw new Error("unreachable");

    const comments = await prisma.reviewComment.findMany({
      where: { reviewId: result.reviewId },
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].filePath).toBe("(PR diff)");
    expect(comments[0].severity).toBe("WARNING");
  });

  it("AI呼び出し失敗時はReviewをFAILEDにする", async () => {
    mockGetDiff.mockResolvedValue({ diff: "diff --git a/x b/x", truncated: false });
    mockParse.mockRejectedValue(new Error("upstream boom"));

    const result = await call();
    expect(result.status).toBe("FAILED");
    if (result.status === "FETCH_ERROR") throw new Error("unreachable");

    const review = await prisma.review.findUnique({ where: { id: result.reviewId } });
    expect(review?.status).toBe("FAILED");
  });

  it("PR取得に失敗した場合はFETCH_ERRORを返す", async () => {
    mockGetPR.mockRejectedValue(new Error("boom"));

    const result = await call();
    expect(result.status).toBe("FETCH_ERROR");
  });
});
