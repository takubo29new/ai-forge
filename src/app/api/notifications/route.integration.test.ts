import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

describe("GET /api/notifications", () => {
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
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("自分の通知を新しい順に返し、未読件数も返す", async () => {
    await prisma.notification.create({
      data: { userId, message: "古い通知", read: true },
    });
    await prisma.notification.create({
      data: { userId, message: "新しい通知", read: false },
    });
    const other = await createTestUser();
    await prisma.notification.create({
      data: { userId: other.id, message: "他人の通知", read: false },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications[0].message).toBe("新しい通知");
    expect(body.unreadCount).toBe(1);

    await cleanupTestUser(other.id);
  });
});
