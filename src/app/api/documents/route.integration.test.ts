import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

// next-authのauth()はミドルウェアとしても呼べるよう複数のオーバーロードを持ち、
// そのままではmockResolvedValue()が型エラーになるため、テストで実際に
// 使う「セッション取得関数」としての形に絞って再キャストする。
const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function request(body: unknown) {
  return new Request("http://localhost/api/documents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

describe("POST /api/documents", () => {
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
    const res = await POST(request({ title: "x", content: "y" }));
    expect(res.status).toBe(401);
  });

  it("タイトルまたは本文が空なら400を返す", async () => {
    const res = await POST(request({ title: "", content: "本文" }));
    expect(res.status).toBe(400);
  });

  it("見出し単位でチャンク分割し、各チャンクにembeddingを保存して201を返す", async () => {
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1), fakeEmbedding(2)]);

    const res = await POST(
      request({
        title: "テストドキュメント",
        content: "## セクション1\n本文1\n\n## セクション2\n本文2",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.chunkCount).toBe(2);

    const chunks = await prisma.$queryRaw<{ id: string; hasEmbedding: boolean }[]>`
      SELECT id, (embedding IS NOT NULL) AS "hasEmbedding"
      FROM "DocumentChunk"
      WHERE "documentId" = ${body.id}
      ORDER BY "chunkIndex" ASC
    `;
    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => c.hasEmbedding)).toBe(true);
  });

  it("埋め込み生成に失敗した場合はDocumentを作り直せる状態に戻し502を返す", async () => {
    mockEmbedDocuments.mockRejectedValue(new Error("voyage down"));

    const res = await POST(
      request({ title: "失敗するドキュメント", content: "## 本文\nテスト" }),
    );
    expect(res.status).toBe(502);

    const documents = await prisma.document.findMany({ where: { userId } });
    expect(documents).toHaveLength(0);
  });

  it("Voyage AIのレート制限(429)時は具体的な案内メッセージを返す", async () => {
    const { VoyageApiError } = await import("@/lib/voyage");
    mockEmbedDocuments.mockRejectedValue(
      new VoyageApiError(429, "rate limited"),
    );

    const res = await POST(
      request({ title: "レート制限テスト", content: "## 本文\nテスト" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("レート制限");
  });
});

describe("GET /api/documents", () => {
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

  it("自分のドキュメント一覧を新しい順に返す", async () => {
    await prisma.document.create({
      data: { title: "A", content: "a", sourceType: "MANUAL", userId },
    });
    await prisma.document.create({
      data: { title: "B", content: "b", sourceType: "MANUAL", userId },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("B");
  });
});
