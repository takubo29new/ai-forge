import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PATCH, DELETE } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/categories/x", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/categories/:id", () => {
  let userId: string;
  let categoryId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const category = await prisma.category.create({ data: { userId, name: "元の名前" } });
    categoryId = category.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "新しい名前" }), ctx(categoryId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのカテゴリには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await PATCH(patchRequest({ name: "新しい名前" }), ctx(categoryId));
    expect(res.status).toBe(404);
  });

  it("名前が空なら400を返す", async () => {
    const res = await PATCH(patchRequest({ name: " " }), ctx(categoryId));
    expect(res.status).toBe(400);
  });

  it("更新に成功すると新しい内容を返す", async () => {
    const res = await PATCH(
      patchRequest({ name: "新しい名前", description: "説明" }),
      ctx(categoryId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("新しい名前");
    expect(body.description).toBe("説明");
  });

  it("既存の別カテゴリと同名に更新しようとすると409を返す", async () => {
    await prisma.category.create({ data: { userId, name: "既存の名前" } });
    const res = await PATCH(patchRequest({ name: "既存の名前" }), ctx(categoryId));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/categories/:id", () => {
  let userId: string;
  let categoryId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const category = await prisma.category.create({ data: { userId, name: "削除対象" } });
    categoryId = category.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/categories/x"), ctx(categoryId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのカテゴリには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await DELETE(new Request("http://localhost/api/categories/x"), ctx(categoryId));
    expect(res.status).toBe(404);
  });

  it("削除に成功すると204を返し、所属プロンプトはカテゴリ未分類のまま残る(SetNull)", async () => {
    const prompt = await prisma.prompt.create({
      data: {
        title: "p",
        userId,
        categoryId,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });

    const res = await DELETE(new Request("http://localhost/api/categories/x"), ctx(categoryId));
    expect(res.status).toBe(204);

    const found = await prisma.category.findUnique({ where: { id: categoryId } });
    expect(found).toBeNull();

    const stillExists = await prisma.prompt.findUnique({ where: { id: prompt.id } });
    expect(stillExists?.categoryId).toBeNull();
  });
});
