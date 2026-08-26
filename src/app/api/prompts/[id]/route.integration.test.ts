import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { GET, PATCH, DELETE } from "./route";
import { cleanupTestUser, createTestPrompt, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

function request(body: unknown) {
  return new Request("http://localhost/api/prompts/x", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/prompts/:id", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "元のプロンプト本文");
    promptId = prompt.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockEmbedDocuments.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(request({ content: "新しい本文" }), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await PATCH(request({ content: "新しい本文" }), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("新しいバージョンを保存すると埋め込みが生成される", async () => {
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);

    const res = await PATCH(request({ content: "新しい本文" }), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    const newVersion = body.versions[0];

    expect(mockEmbedDocuments).toHaveBeenCalledWith(["新しい本文"]);
    const embedded = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "PromptVersionEmbedding"
      WHERE "promptVersionId" = ${newVersion.id}
    `;
    expect(Number(embedded[0].count)).toBe(1);
  });

  it("埋め込み生成が失敗してもプロンプト保存自体は200のまま返す(ベストエフォート)", async () => {
    mockEmbedDocuments.mockRejectedValue(new Error("voyage boom"));

    const res = await PATCH(request({ content: "新しい本文" }), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions[0].content).toBe("新しい本文");
  });

  it("contentを変更しない更新(タイトルのみ)では埋め込みを生成しない", async () => {
    const res = await PATCH(request({ title: "新しいタイトル" }), ctx(promptId));
    expect(res.status).toBe(200);
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });
});

describe("GET /api/prompts/:id", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "本文");
    promptId = prompt.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await GET(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("存在しないIDには404を返す", async () => {
    const res = await GET(
      new Request("http://localhost/api/prompts/x"),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  it("取得に成功すると最新バージョンを含めて返す", async () => {
    const res = await GET(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(promptId);
    expect(body.versions[0].content).toBe("本文");
  });
});

describe("DELETE /api/prompts/:id", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "本文");
    promptId = prompt.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await DELETE(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("削除に成功すると204を返し、バージョンもカスケード削除される", async () => {
    const res = await DELETE(new Request("http://localhost/api/prompts/x"), ctx(promptId));
    expect(res.status).toBe(204);

    const found = await prisma.prompt.findUnique({ where: { id: promptId } });
    expect(found).toBeNull();
    const versions = await prisma.promptVersion.findMany({ where: { promptId } });
    expect(versions).toHaveLength(0);
  });
});
