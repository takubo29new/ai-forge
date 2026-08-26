import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import { cleanupTestUser, createTestPrompt, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

describe("POST /api/prompt-versions/backfill-embeddings", () => {
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

  it("未処理のバージョンが無ければprocessed: 0を返す", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
  });

  it("埋め込みが無いバージョンにembeddingを追加する", async () => {
    const prompt = await createTestPrompt(userId, "本文A");
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 1, remaining: false });

    const embedded = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "PromptVersionEmbedding" pve
      JOIN "PromptVersion" pv ON pv.id = pve."promptVersionId"
      WHERE pv."promptId" = ${prompt.id}
    `;
    expect(Number(embedded[0].count)).toBe(1);
  });

  it("既に埋め込み済みのバージョンは対象にしない", async () => {
    await createTestPrompt(userId, "本文A");
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);
    await POST();

    mockEmbedDocuments.mockClear();
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });
});
