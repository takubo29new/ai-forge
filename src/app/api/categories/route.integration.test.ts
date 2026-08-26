import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function request(body: unknown) {
  return new Request("http://localhost/api/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/categories", () => {
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

  it("自分のカテゴリのみを作成日時の古い順で返し、所属プロンプト数を含む", async () => {
    const other = await createTestUser();
    await prisma.category.create({ data: { userId: other.id, name: "他ユーザーのカテゴリ" } });

    const catA = await prisma.category.create({ data: { userId, name: "先に作成" } });
    await prisma.category.create({ data: { userId, name: "後に作成" } });
    await prisma.prompt.create({
      data: {
        title: "p",
        userId,
        categoryId: catA.id,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("先に作成");
    expect(body[0]._count.prompts).toBe(1);
    expect(body.map((c: { name: string }) => c.name)).not.toContain("他ユーザーのカテゴリ");

    await cleanupTestUser(other.id);
  });
});

describe("POST /api/categories", () => {
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
    const res = await POST(request({ name: "テスト" }));
    expect(res.status).toBe(401);
  });

  it("名前が空なら400を返す", async () => {
    const res = await POST(request({ name: "  " }));
    expect(res.status).toBe(400);
  });

  it("作成に成功すると201を返す", async () => {
    const res = await POST(request({ name: "料理", description: "レシピ関連" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("料理");
    expect(body.description).toBe("レシピ関連");
    expect(body._count.prompts).toBe(0);
  });

  it("同じユーザー内で同名のカテゴリを作ろうとすると409を返す", async () => {
    await POST(request({ name: "重複" }));
    const res = await POST(request({ name: "重複" }));
    expect(res.status).toBe(409);
  });
});
