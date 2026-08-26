import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST/DELETE /api/reviews/:id/share", () => {
  let userId: string;
  let successReviewId: string;
  let failedReviewId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const repo = await createTestRepository(userId);
    const prompt = await createTestPrompt(userId, "{{diff}}をレビューして");
    const promptVersion = await prisma.promptVersion.findFirstOrThrow({
      where: { promptId: prompt.id },
    });

    const successReview = await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId: promptVersion.id,
        pullRequestNumber: 1,
        pullRequestTitle: "share test PR",
        pullRequestUrl: "https://github.com/o/r/pull/1",
        headSha: "abc",
        status: "SUCCESS",
      },
    });
    successReviewId = successReview.id;

    const failedReview = await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId: promptVersion.id,
        pullRequestNumber: 2,
        pullRequestTitle: "failed PR",
        pullRequestUrl: "https://github.com/o/r/pull/2",
        headSha: "def",
        status: "FAILED",
      },
    });
    failedReviewId = failedReview.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("POST: 認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), ctx(successReviewId));
    expect(res.status).toBe(401);
  });

  it("POST: 他ユーザーのレビューには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(new Request("http://localhost"), ctx(successReviewId));
    expect(res.status).toBe(404);
  });

  it("POST: FAILEDのレビューは共有できず400を返す", async () => {
    const res = await POST(new Request("http://localhost"), ctx(failedReviewId));
    expect(res.status).toBe(400);
  });

  it("POST: SUCCESSのレビューは共有トークンを発行する", async () => {
    const res = await POST(new Request("http://localhost"), ctx(successReviewId));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.shareToken).toBe("string");
    expect(body.shareToken.length).toBeGreaterThan(10);

    const stored = await prisma.review.findUnique({
      where: { id: successReviewId },
    });
    expect(stored?.shareToken).toBe(body.shareToken);
    expect(stored?.sharedAt).not.toBeNull();
  });

  it("POST: 既に共有済みなら同じトークンを再度返す(冪等)", async () => {
    const first = await POST(new Request("http://localhost"), ctx(successReviewId));
    const firstBody = await first.json();

    const second = await POST(new Request("http://localhost"), ctx(successReviewId));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.shareToken).toBe(firstBody.shareToken);
  });

  it("DELETE: 他ユーザーのレビューには404を返す", async () => {
    await POST(new Request("http://localhost"), ctx(successReviewId));
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await DELETE(new Request("http://localhost"), ctx(successReviewId));
    expect(res.status).toBe(404);
  });

  it("DELETE: 共有を解除するとshareTokenがnullになる", async () => {
    await POST(new Request("http://localhost"), ctx(successReviewId));
    const res = await DELETE(new Request("http://localhost"), ctx(successReviewId));
    expect(res.status).toBe(204);

    const stored = await prisma.review.findUnique({
      where: { id: successReviewId },
    });
    expect(stored?.shareToken).toBeNull();
    expect(stored?.sharedAt).toBeNull();
  });
});
