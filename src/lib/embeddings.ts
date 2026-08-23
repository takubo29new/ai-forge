import { prisma } from "@/lib/prisma";

// pgvectorのvector型はPrismaのUnsupported型として宣言しており、Prisma Clientの
// 通常のSELECT/INSERTには含まれないため、埋め込みの書き込みは$executeRawで行う
// (docs/db-design.md参照)。

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function setDocumentChunkEmbedding(
  chunkId: string,
  embedding: number[],
) {
  await prisma.$executeRaw`
    UPDATE "DocumentChunk"
    SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE id = ${chunkId}
  `;
}

export async function setReviewCommentEmbedding(
  reviewCommentId: string,
  embedding: number[],
) {
  await prisma.$executeRaw`
    INSERT INTO "ReviewCommentEmbedding" ("reviewCommentId", "embedding")
    VALUES (${reviewCommentId}, ${toVectorLiteral(embedding)}::vector)
    ON CONFLICT ("reviewCommentId") DO UPDATE SET embedding = EXCLUDED.embedding
  `;
}

export type DocumentChunkSearchHit = {
  kind: "document_chunk";
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  distance: number;
};

export type ReviewCommentSearchHit = {
  kind: "review_comment";
  id: string;
  reviewId: string;
  filePath: string;
  severity: string;
  body: string;
  pullRequestTitle: string;
  pullRequestNumber: number;
  distance: number;
};

export async function searchDocumentChunks(
  userId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<DocumentChunkSearchHit[]> {
  const rows = await prisma.$queryRaw<
    { id: string; documentId: string; documentTitle: string; content: string; distance: number }[]
  >`
    SELECT dc.id, dc."documentId", d.title AS "documentTitle", dc.content,
           dc.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector AS distance
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE d."userId" = ${userId} AND dc.embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "document_chunk", ...row }));
}

export async function searchReviewComments(
  userId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<ReviewCommentSearchHit[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      reviewId: string;
      filePath: string;
      severity: string;
      body: string;
      pullRequestTitle: string;
      pullRequestNumber: number;
      distance: number;
    }[]
  >`
    SELECT rc.id, rc."reviewId", rc."filePath", rc.severity, rc.body,
           r."pullRequestTitle", r."pullRequestNumber",
           rce.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector AS distance
    FROM "ReviewCommentEmbedding" rce
    JOIN "ReviewComment" rc ON rc.id = rce."reviewCommentId"
    JOIN "Review" r ON r.id = rc."reviewId"
    WHERE r."userId" = ${userId}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "review_comment", ...row }));
}
