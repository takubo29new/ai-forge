import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
  getPullRequest: vi.fn(),
  getPullRequestDiff: vi.fn(),
  createPullRequestComment: vi.fn(),
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { anthropic } from "@/lib/anthropic";
import {
  getGitHubClient,
  getPullRequest,
  getPullRequestDiff,
  createPullRequestComment,
} from "@/lib/github";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";
import { processPendingReviews } from "@/lib/process-pending-reviews";

const mockParse = vi.mocked(anthropic.messages.parse);
const mockGetClient = vi.mocked(getGitHubClient);
const mockGetPR = vi.mocked(getPullRequest);
const mockGetDiff = vi.mocked(getPullRequestDiff);
const mockEmbedDocuments = vi.mocked(embedDocuments);
const mockCreateComment = vi.mocked(createPullRequestComment);

describe("processPendingReviews", () => {
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
    mockGetClient.mockReset().mockResolvedValue({} as never);
    mockGetPR.mockReset().mockResolvedValue({
      number: 42,
      title: "Add feature",
      url: "https://github.com/octo-test/repo-test/pull/42",
      headSha: "abc123",
    });
    mockGetDiff.mockReset().mockResolvedValue({
      diff: "diff --git a/x b/x",
      truncated: false,
    });
    mockEmbedDocuments.mockReset().mockResolvedValue([]);
    mockCreateComment.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  async function createPendingReview(pullRequestNumber = 42) {
    return prisma.review.create({
      data: {
        repositoryId,
        userId,
        promptVersionId,
        pullRequestNumber,
        pullRequestTitle: "Add feature",
        pullRequestUrl: "https://github.com/octo-test/repo-test/pull/42",
        headSha: "abc123",
        status: "PENDING",
        triggeredVia: "WEBHOOK",
      },
    });
  }

  it("PENDINGが無ければ何もせず0件で返す", async () => {
    const result = await processPendingReviews();
    expect(result.processed).toBe(0);
  });

  it("PENDINGなReviewをSUCCESSに更新し完了通知を作る", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        findings: [
          { filePath: "src/x.ts", line: 3, severity: "WARNING", body: "未使用の変数" },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);

    const pending = await createPendingReview();

    const result = await processPendingReviews();
    expect(result.processed).toBe(1);

    const review = await prisma.review.findUnique({
      where: { id: pending.id },
      include: { comments: true },
    });
    expect(review?.status).toBe("SUCCESS");
    expect(review?.comments).toHaveLength(1);

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("完了");
    expect(notifications[0].link).toBe(`/reviews/${pending.id}`);

    expect(mockCreateComment).toHaveBeenCalledTimes(1);
  });

  it("GitHub連携情報が無い場合はFAILEDにしてスキップ通知を作る", async () => {
    mockGetClient.mockResolvedValue(null);

    const pending = await createPendingReview();

    const result = await processPendingReviews();
    expect(result.processed).toBe(1);

    const review = await prisma.review.findUnique({ where: { id: pending.id } });
    expect(review?.status).toBe("FAILED");

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");

    expect(mockGetPR).not.toHaveBeenCalled();
  });

  it("PR取得に失敗した場合はFAILEDにしてスキップ通知を作る", async () => {
    mockGetPR.mockRejectedValue(new Error("boom"));

    const pending = await createPendingReview();

    const result = await processPendingReviews();
    expect(result.processed).toBe(1);

    const review = await prisma.review.findUnique({ where: { id: pending.id } });
    expect(review?.status).toBe("FAILED");

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
  });

  it("複数件のPENDINGを作成順に処理する", async () => {
    mockParse.mockResolvedValue({
      parsed_output: { findings: [] },
      usage: { input_tokens: 10, output_tokens: 10 },
    } as never);

    const first = await createPendingReview(1);
    const second = await createPendingReview(2);

    const result = await processPendingReviews();
    expect(result.processed).toBe(2);

    const reviews = await prisma.review.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(reviews.every((r) => r.status === "SUCCESS")).toBe(true);
  });
});
