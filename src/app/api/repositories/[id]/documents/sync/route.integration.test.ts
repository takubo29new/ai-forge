import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
  fetchRepositoryMarkdownFiles: vi.fn(),
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { getGitHubClient, fetchRepositoryMarkdownFiles } from "@/lib/github";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockGetClient = vi.mocked(getGitHubClient);
const mockFetchFiles = vi.mocked(fetchRepositoryMarkdownFiles);
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbeddings(count: number) {
  return Array.from({ length: count }, (_, i) =>
    Array.from({ length: 1024 }, (_, d) => (d === 0 ? i : 0)),
  );
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/repositories/:id/documents/sync", () => {
  let userId: string;
  let repositoryId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockGetClient.mockReset().mockResolvedValue({} as never);
    mockFetchFiles.mockReset().mockResolvedValue([
      { sourcePath: "README.md", content: "# Test repo\n\nhello" },
      { sourcePath: "docs/design.md", content: "## Design\n\nsome design notes" },
    ]);
    mockEmbedDocuments.mockReset();
    mockEmbedDocuments.mockImplementation(async (texts: string[]) =>
      fakeEmbeddings(texts.length),
    );
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), ctx(repositoryId));
    expect(res.status).toBe(401);
  });

  it("存在しない/他ユーザーのリポジトリなら404を返す", async () => {
    const res = await POST(new Request("http://localhost"), ctx("no-such-id"));
    expect(res.status).toBe(404);
  });

  it("他ユーザーのリポジトリなら404を返す", async () => {
    const other = await createTestUser();
    const otherRepo = await createTestRepository(other.id);
    const res = await POST(new Request("http://localhost"), ctx(otherRepo.id));
    expect(res.status).toBe(404);
    await cleanupTestUser(other.id);
  });

  it("GitHub連携情報が無ければ400を返す", async () => {
    mockGetClient.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), ctx(repositoryId));
    expect(res.status).toBe(400);
  });

  it("取得したMarkdownファイルをrepositoryId付きのDocumentとして取り込む", async () => {
    const res = await POST(new Request("http://localhost"), ctx(repositoryId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ syncedDocuments: 2, syncedChunks: 2 });

    const documents = await prisma.document.findMany({
      where: { userId, repositoryId },
      include: { chunks: true },
    });
    expect(documents).toHaveLength(2);
    expect(documents.every((d) => d.sourceType === "REPO_FILE")).toBe(true);
    expect(documents.some((d) => d.sourcePath === "README.md")).toBe(true);
    expect(documents.some((d) => d.sourcePath === "docs/design.md")).toBe(true);

    const withoutEmbedding = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."userId" = ${userId} AND dc.embedding IS NULL
    `;
    expect(Number(withoutEmbedding[0].count)).toBe(0);
  });

  it("ai-forge自身の同期(repositoryId: null)とは独立している", async () => {
    // 同じsourcePath("README.md")のDocumentがrepositoryId無し(ai-forge自身)で
    // 既に存在していても、リポジトリ同期側には影響しない(複合ユニーク制約の確認)
    await prisma.document.create({
      data: {
        title: "README.md",
        content: "self readme",
        sourceType: "REPO_FILE",
        sourcePath: "README.md",
        userId,
        repositoryId: null,
        chunks: { create: [{ chunkIndex: 0, content: "self readme" }] },
      },
    });

    const res = await POST(new Request("http://localhost"), ctx(repositoryId));
    expect(res.status).toBe(200);

    const selfDoc = await prisma.document.findFirst({
      where: { userId, repositoryId: null, sourcePath: "README.md" },
    });
    expect(selfDoc).not.toBeNull();
    const repoDoc = await prisma.document.findFirst({
      where: { userId, repositoryId, sourcePath: "README.md" },
    });
    expect(repoDoc).not.toBeNull();
  });

  it("リポジトリの接続解除でDocumentも削除される", async () => {
    await POST(new Request("http://localhost"), ctx(repositoryId));
    const before = await prisma.document.count({ where: { repositoryId } });
    expect(before).toBeGreaterThan(0);

    await prisma.repository.delete({ where: { id: repositoryId } });

    const after = await prisma.document.count({ where: { repositoryId } });
    expect(after).toBe(0);
  });

  it("埋め込み生成に失敗した場合はDocumentを作らない", async () => {
    mockEmbedDocuments.mockReset().mockRejectedValue(new Error("voyage down"));

    const res = await POST(new Request("http://localhost"), ctx(repositoryId));
    expect(res.status).toBe(502);

    const documents = await prisma.document.findMany({ where: { userId, repositoryId } });
    expect(documents).toHaveLength(0);
  });
});
