import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/notifications/:id", () => {
  let userId: string;
  let notificationId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const notification = await prisma.notification.create({
      data: { userId, message: "テスト通知", read: false },
    });
    notificationId = notification.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(new Request("http://localhost"), ctx(notificationId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーの通知には404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await PATCH(new Request("http://localhost"), ctx(notificationId));
    expect(res.status).toBe(404);
  });

  it("自分の通知を既読にできる", async () => {
    const res = await PATCH(new Request("http://localhost"), ctx(notificationId));
    expect(res.status).toBe(204);

    const stored = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    expect(stored?.read).toBe(true);
  });
});
