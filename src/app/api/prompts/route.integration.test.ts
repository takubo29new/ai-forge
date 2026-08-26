import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function getRequest(query = "") {
  return new Request(`http://localhost/api/prompts${query}`);
}

function postRequest(body: unknown) {
  return new Request("http://localhost/api/prompts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/prompts", () => {
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
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("自分のプロンプトのみを更新日時の新しい順で返す", async () => {
    const other = await createTestUser();
    await prisma.prompt.create({
      data: {
        title: "他ユーザーのプロンプト",
        userId: other.id,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });

    await prisma.prompt.create({
      data: { title: "古い", userId, versions: { create: { versionNumber: 1, content: "c" } } },
    });
    await prisma.prompt.create({
      data: { title: "新しい", userId, versions: { create: { versionNumber: 1, content: "c" } } },
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("新しい");

    await cleanupTestUser(other.id);
  });

  it("categoryIdで絞り込める", async () => {
    const category = await prisma.category.create({ data: { userId, name: "カテゴリA" } });
    await prisma.prompt.create({
      data: {
        title: "カテゴリ内",
        userId,
        categoryId: category.id,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });
    await prisma.prompt.create({
      data: { title: "未分類", userId, versions: { create: { versionNumber: 1, content: "c" } } },
    });

    const res = await GET(getRequest(`?categoryId=${category.id}`));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("カテゴリ内");
  });

  it("qでタイトルを部分一致(大文字小文字を区別しない)絞り込みできる", async () => {
    await prisma.prompt.create({
      data: { title: "Weekly Report", userId, versions: { create: { versionNumber: 1, content: "c" } } },
    });
    await prisma.prompt.create({
      data: { title: "料理レシピ", userId, versions: { create: { versionNumber: 1, content: "c" } } },
    });

    const res = await GET(getRequest("?q=weekly"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Weekly Report");
  });
});

describe("POST /api/prompts", () => {
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
    const res = await POST(postRequest({ title: "t", content: "c" }));
    expect(res.status).toBe(401);
  });

  it("タイトルが空なら400を返す", async () => {
    const res = await POST(postRequest({ title: " ", content: "c" }));
    expect(res.status).toBe(400);
  });

  it("本文が空なら400を返す", async () => {
    const res = await POST(postRequest({ title: "t", content: " " }));
    expect(res.status).toBe(400);
  });

  it("他ユーザーのcategoryIdを指定すると400を返す", async () => {
    const other = await createTestUser();
    const otherCategory = await prisma.category.create({
      data: { userId: other.id, name: "他ユーザーのカテゴリ" },
    });

    const res = await POST(
      postRequest({ title: "t", content: "c", categoryId: otherCategory.id }),
    );
    expect(res.status).toBe(400);

    await cleanupTestUser(other.id);
  });

  it("作成に成功すると201でversionNumber=1のバージョンを含めて返す", async () => {
    const res = await POST(postRequest({ title: "新しいプロンプト", content: "本文" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("新しいプロンプト");
    expect(body.versions[0].versionNumber).toBe(1);
    expect(body.versions[0].content).toBe("本文");
  });
});
