import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function request() {
  return new Request("http://localhost/api/evaluations/batches/x/skip", {
    method: "POST",
  });
}

describe("POST /api/evaluations/batches/[batchId]/skip", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(request(), {
      params: Promise.resolve({ batchId: "does-not-matter" }),
    });
    expect(res.status).toBe(401);
  });

  it("存在しない/他ユーザーのbatchIdには404を返す", async () => {
    const res = await POST(request(), {
      params: Promise.resolve({ batchId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("完了カウンタを進め、totalに達すればまとめ通知を1回だけ作る", async () => {
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 1 },
    });

    const res = await POST(request(), { params: Promise.resolve({ batchId: batch.id }) });
    expect(res.status).toBe(204);

    const updated = await prisma.evaluationBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updated.completedCount).toBe(1);
    expect(updated.notifiedAt).not.toBeNull();

    const notifications = await prisma.notification.findMany({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(notifications).toHaveLength(1);
  });
});
