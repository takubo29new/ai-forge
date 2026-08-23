import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/voyage", () => ({ embedDocuments: vi.fn() }));

import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

async function createReviewWithComments(userId: string, bodies: string[]) {
  const repo = await createTestRepository(userId);
  const prompt = await createTestPrompt(userId, "レビューして: {{diff}}");
  const review = await prisma.review.create({
    data: {
      repositoryId: repo.id,
      userId,
      promptVersionId: prompt.versions[0].id,
      pullRequestNumber: 1,
      pullRequestTitle: "test",
      pullRequestUrl: "https://github.com/o/r/pull/1",
      headSha: "abc",
      status: "SUCCESS",
      comments: {
        create: bodies.map((body) => ({
          filePath: "src/x.ts",
          severity: "INFO" as const,
          body,
        })),
      },
    },
  });
  return review;
}

describe("POST /api/review-comments/backfill-embeddings", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockEmbedDocuments.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("未処理の指摘が無ければprocessed: 0を返す", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
  });

  it("埋め込みが無い指摘にembeddingを追加する", async () => {
    await createReviewWithComments(userId, ["指摘A", "指摘B"]);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1), fakeEmbedding(2)]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 2, remaining: false });

    const embedded = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "ReviewCommentEmbedding"
    `;
    expect(Number(embedded[0].count)).toBe(2);
  });

  it("既に埋め込み済みの指摘は対象にしない", async () => {
    await createReviewWithComments(userId, ["指摘A"]);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);
    await POST();

    mockEmbedDocuments.mockClear();
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });
});
