import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/documents/:id", () => {
  let userId: string;
  let documentId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const document = await prisma.document.create({
      data: {
        title: "削除対象",
        content: "本文",
        sourceType: "MANUAL",
        userId,
        chunks: { create: [{ chunkIndex: 0, content: "本文" }] },
      },
    });
    documentId = document.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("他ユーザーのドキュメントには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await DELETE(new Request("http://localhost"), ctx(documentId));
    expect(res.status).toBe(404);
  });

  it("削除するとDocumentChunkもカスケード削除され204を返す", async () => {
    const res = await DELETE(new Request("http://localhost"), ctx(documentId));
    expect(res.status).toBe(204);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    expect(document).toBeNull();

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
    });
    expect(chunks).toHaveLength(0);
  });
});
