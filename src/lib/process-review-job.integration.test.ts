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
import { processReviewJob, type ReviewJobPayload } from "./process-review-job";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockParse = vi.mocked(anthropic.messages.parse);
const mockGetClient = vi.mocked(getGitHubClient);
const mockGetPR = vi.mocked(getPullRequest);
const mockGetDiff = vi.mocked(getPullRequestDiff);
const mockEmbedDocuments = vi.mocked(embedDocuments);
const mockCreateComment = vi.mocked(createPullRequestComment);

// Webhook自動レビューの実処理(Vercel Queuesのコンシューマーから呼ばれる部分)。
// 以前はWebhook受信ルート自身のバックグラウンド処理としてテストしていたが、
// Issue #106の非同期化(PR #125のVercel実行時間上限問題への対応)でここに
// 切り出した。
describe("processReviewJob", () => {
  let userId: string;
  let repositoryId: string;
  let promptWithDiffId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const prompt = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptWithDiffId = prompt.id;

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

  function payload(overrides: Partial<ReviewJobPayload> = {}): ReviewJobPayload {
    return {
      repositoryId,
      userId,
      promptVersionId: promptWithDiffId,
      pullRequestNumber: 42,
      triggeredVia: "WEBHOOK",
      ...overrides,
    };
  }

  it("レビューを実行しWEBHOOKとして記録し、PRへコメントを投稿する", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        findings: [
          { filePath: "src/x.ts", line: 3, severity: "WARNING", body: "未使用の変数" },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);

    await processReviewJob(payload());

    const review = await prisma.review.findFirst({
      where: { repositoryId },
      include: { comments: true },
    });
    expect(review?.status).toBe("SUCCESS");
    expect(review?.triggeredVia).toBe("WEBHOOK");
    expect(review?.comments).toHaveLength(1);

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("完了");
    expect(notifications[0].link).toBe(`/reviews/${review!.id}`);

    expect(mockCreateComment).toHaveBeenCalledTimes(1);
    const [, , , pullNumberArg, bodyArg] = mockCreateComment.mock.calls[0];
    expect(pullNumberArg).toBe(42);
    expect(bodyArg).toContain("未使用の変数");
    expect(bodyArg).toContain("src/x.ts:3");
  });

  it("GitHub連携情報が無い場合はレビューを作らずスキップ通知を作成する", async () => {
    mockGetClient.mockReset().mockResolvedValue(null);

    await processReviewJob(payload());

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
  });

  it("PR取得に失敗した場合はReviewを作らずスキップ通知を作成する", async () => {
    mockGetPR.mockRejectedValue(new Error("boom"));

    await processReviewJob(payload());

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
  });

  it("リポジトリが既に削除されている場合は何もしない", async () => {
    await processReviewJob(payload({ repositoryId: "does-not-exist" }));

    expect(mockGetClient).not.toHaveBeenCalled();
    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(0);
  });
});
