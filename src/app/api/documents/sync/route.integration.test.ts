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
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbeddings(count: number) {
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: 1024 }, (_, d) => (d === 0 ? i : 0)),
  );
}

describe("POST /api/documents/sync", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockEmbedDocuments.mockReset();
    // 実DBに埋め込みを保存する数だけ動的に決めるため、呼び出し引数の件数に
    // 合わせたダミーembeddingを返す実装にしておく。
    mockEmbedDocuments.mockImplementation(async (texts: string[]) =>
      fakeEmbeddings(texts.length),
    );
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("docs配下のMarkdownとルート2ファイルをDocumentとして取り込む", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncedDocuments).toBeGreaterThan(0);
    expect(body.syncedChunks).toBeGreaterThan(0);

    const documents = await prisma.document.findMany({
      where: { userId, sourceType: "REPO_FILE" },
      include: { chunks: true },
    });
    expect(documents.length).toBe(body.syncedDocuments);
    expect(documents.some((d) => d.sourcePath === "README.md")).toBe(true);
    expect(
      documents.some((d) => d.sourcePath === "docs/db-design.md"),
    ).toBe(true);

    // 取り込んだ全チャンクに埋め込みが入っていること
    const withoutEmbedding = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."userId" = ${userId} AND dc.embedding IS NULL
    `;
    expect(Number(withoutEmbedding[0].count)).toBe(0);
  });

  it("再実行すると同じsourcePathのDocumentが作り直される(件数は増えない)", async () => {
    await POST();
    const first = await prisma.document.count({
      where: { userId, sourceType: "REPO_FILE" },
    });

    const res = await POST();
    const body = await res.json();
    expect(body.syncedDocuments).toBe(first);

    const second = await prisma.document.count({
      where: { userId, sourceType: "REPO_FILE" },
    });
    expect(second).toBe(first);
  });

  it("埋め込み生成に失敗した場合はDocumentを作らない", async () => {
    mockEmbedDocuments.mockReset().mockRejectedValue(new Error("voyage down"));

    const res = await POST();
    expect(res.status).toBe(502);

    const documents = await prisma.document.findMany({ where: { userId } });
    expect(documents).toHaveLength(0);
  });
});
