import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";
import { MAX_BATCH_SIZE } from "@/lib/evaluation-batch-limits";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function request(body: unknown) {
  return new Request("http://localhost/api/evaluations/batches", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/evaluations/batches", () => {
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
    const res = await POST(request({ total: 3 }));
    expect(res.status).toBe(401);
  });

  it("totalが1以下なら400を返す", async () => {
    const res = await POST(request({ total: 1 }));
    expect(res.status).toBe(400);
  });

  it(`totalが${MAX_BATCH_SIZE}を超えると400を返す`, async () => {
    const res = await POST(request({ total: MAX_BATCH_SIZE + 1 }));
    expect(res.status).toBe(400);
  });

  it("成功時は201でbatchIdを返し、自分のuserIdで作成する", async () => {
    const res = await POST(request({ total: 3 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.total).toBe(3);

    const batch = await prisma.evaluationBatch.findUnique({
      where: { id: body.batchId },
    });
    expect(batch?.userId).toBe(userId);
    expect(batch?.total).toBe(3);
    expect(batch?.completedCount).toBe(0);
  });
});
