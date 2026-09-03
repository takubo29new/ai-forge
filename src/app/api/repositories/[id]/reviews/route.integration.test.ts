import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
  getPullRequest: vi.fn(),
}));
vi.mock("@/lib/trigger-review-worker", () => ({
  triggerReviewWorker: vi.fn(),
}));

import { auth } from "@/auth";
import { getGitHubClient, getPullRequest } from "@/lib/github";
import { triggerReviewWorker } from "@/lib/trigger-review-worker";
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
const mockGetClient = vi.mocked(getGitHubClient);
const mockGetPR = vi.mocked(getPullRequest);
const mockTriggerWorker = vi.mocked(triggerReviewWorker);

function request(body: unknown) {
  return new Request("http://localhost/api/repositories/x/reviews", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// このルートはPR取得(GitHub API呼び出し)までしか行わず、Reviewをstatus: PENDINGで
// 作成してGitHub Actionsワーカーの即時起動(triggerReviewWorker)を呼ぶだけに留める
// (Vercel Hobbyプランのmax duration内にClaude呼び出しが収まらないケースがあった
// ため)。AIレビュー自体の内容(指摘の作成・diff切り詰め警告・埋め込み生成等)は
// runRepositoryReview()側のテスト(../../../../lib/run-repository-review.integration.test.ts)で検証する。
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
    mockGetClient.mockReset().mockResolvedValue({} as never);
    mockGetPR.mockReset().mockResolvedValue({
      number: 42,
      title: "Add feature",
      url: "https://github.com/octo-test/repo-test/pull/42",
      headSha: "abc123",
    });
    mockTriggerWorker.mockReset().mockResolvedValue(undefined);
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

  it("GitHub連携情報が見つからない場合は400を返す", async () => {
    mockGetClient.mockResolvedValue(null);
    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(400);
    expect(mockGetPR).not.toHaveBeenCalled();
  });

  it("PR取得に失敗した場合は502を返す", async () => {
    mockGetPR.mockRejectedValue(new Error("boom"));
    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(502);
  });

  it("成功時はPENDINGなReviewを作成し202を返し、ワーカーを起動する", async () => {
    const res = await POST(
      request({ pullRequestNumber: 42, promptId: promptWithDiffId }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(202);
    const { id: reviewId } = await res.json();

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(review?.status).toBe("PENDING");
    expect(review?.triggeredVia).toBe("UI");
    expect(review?.pullRequestTitle).toBe("Add feature");

    expect(mockTriggerWorker).toHaveBeenCalledTimes(1);
  });

  it("triggeredVia: CHATを指定するとチャット実行として記録される(Phase 4項目4)", async () => {
    const res = await POST(
      request({
        pullRequestNumber: 42,
        promptId: promptWithDiffId,
        triggeredVia: "CHAT",
      }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(202);
    const { id: reviewId } = await res.json();

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(review?.triggeredVia).toBe("CHAT");
  });

  it("triggeredViaに不正な値を指定してもUIとして扱われる", async () => {
    const res = await POST(
      request({
        pullRequestNumber: 42,
        promptId: promptWithDiffId,
        triggeredVia: "something-else",
      }),
      ctx(repositoryId),
    );
    const { id: reviewId } = await res.json();

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(review?.triggeredVia).toBe("UI");
  });
});
