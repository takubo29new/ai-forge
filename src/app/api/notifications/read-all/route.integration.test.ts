import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

describe("POST /api/notifications/read-all", () => {
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
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("自分の未読通知をすべて既読にする(他ユーザーには影響しない)", async () => {
    await prisma.notification.create({
      data: { userId, message: "通知1", read: false },
    });
    await prisma.notification.create({
      data: { userId, message: "通知2", read: false },
    });
    const other = await createTestUser();
    const otherNotification = await prisma.notification.create({
      data: { userId: other.id, message: "他人の通知", read: false },
    });

    const res = await POST();
    expect(res.status).toBe(204);

    const unread = await prisma.notification.count({
      where: { userId, read: false },
    });
    expect(unread).toBe(0);

    const otherStored = await prisma.notification.findUnique({
      where: { id: otherNotification.id },
    });
    expect(otherStored?.read).toBe(false);

    await cleanupTestUser(other.id);
  });
});
