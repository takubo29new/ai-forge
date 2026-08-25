import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

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

export async function setPromptVersionEmbedding(
  promptVersionId: string,
  embedding: number[],
) {
  await prisma.$executeRaw`
    INSERT INTO "PromptVersionEmbedding" ("promptVersionId", "embedding")
    VALUES (${promptVersionId}, ${toVectorLiteral(embedding)}::vector)
    ON CONFLICT ("promptVersionId") DO UPDATE SET embedding = EXCLUDED.embedding
  `;
}

export async function setExecutionEmbedding(
  executionId: string,
  embedding: number[],
) {
  await prisma.$executeRaw`
    INSERT INTO "ExecutionEmbedding" ("executionId", "embedding")
    VALUES (${executionId}, ${toVectorLiteral(embedding)}::vector)
    ON CONFLICT ("executionId") DO UPDATE SET embedding = EXCLUDED.embedding
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

export type PromptVersionSearchHit = {
  kind: "prompt_version";
  id: string;
  promptId: string;
  promptTitle: string;
  content: string;
  distance: number;
};

export type ExecutionSearchHit = {
  kind: "execution";
  id: string;
  promptId: string;
  promptTitle: string;
  resultText: string;
  distance: number;
};

// repositoryIdを指定すると、そのリポジトリに同期されたDocumentのみに絞り込む
// (Phase 4項目2「プロジェクト単位のドキュメント管理」、/chatの絞り込みUI用)。
// 未指定時は従来通りユーザーの全Documentを横断する。
export async function searchDocumentChunks(
  userId: string,
  queryEmbedding: number[],
  limit: number,
  repositoryId?: string,
): Promise<DocumentChunkSearchHit[]> {
  const repositoryFilter = repositoryId
    ? Prisma.sql`AND d."repositoryId" = ${repositoryId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { id: string; documentId: string; documentTitle: string; content: string; distance: number }[]
  >`
    SELECT dc.id, dc."documentId", d.title AS "documentTitle", dc.content,
           dc.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector AS distance
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE d."userId" = ${userId} AND dc.embedding IS NOT NULL ${repositoryFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "document_chunk", ...row }));
}

// repositoryId指定時はそのリポジトリに対するReviewの指摘のみに絞り込む
// (Reviewはリポジトリに紐づくため、Documentと同じ絞り込みが可能)。
export async function searchReviewComments(
  userId: string,
  queryEmbedding: number[],
  limit: number,
  repositoryId?: string,
): Promise<ReviewCommentSearchHit[]> {
  const repositoryFilter = repositoryId
    ? Prisma.sql`AND r."repositoryId" = ${repositoryId}`
    : Prisma.empty;
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
    WHERE r."userId" = ${userId} ${repositoryFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "review_comment", ...row }));
}

export async function searchPromptVersions(
  userId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<PromptVersionSearchHit[]> {
  const rows = await prisma.$queryRaw<
    { id: string; promptId: string; promptTitle: string; content: string; distance: number }[]
  >`
    SELECT pv.id, pv."promptId", p.title AS "promptTitle", pv.content,
           pve.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector AS distance
    FROM "PromptVersionEmbedding" pve
    JOIN "PromptVersion" pv ON pv.id = pve."promptVersionId"
    JOIN "Prompt" p ON p.id = pv."promptId"
    WHERE p."userId" = ${userId}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "prompt_version", ...row }));
}

export async function searchExecutions(
  userId: string,
  queryEmbedding: number[],
  limit: number,
): Promise<ExecutionSearchHit[]> {
  const rows = await prisma.$queryRaw<
    { id: string; promptId: string; promptTitle: string; resultText: string; distance: number }[]
  >`
    SELECT e.id, p.id AS "promptId", p.title AS "promptTitle", e."resultText",
           ee.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector AS distance
    FROM "ExecutionEmbedding" ee
    JOIN "Execution" e ON e.id = ee."executionId"
    JOIN "PromptVersion" pv ON pv.id = e."promptVersionId"
    JOIN "Prompt" p ON p.id = pv."promptId"
    WHERE e."userId" = ${userId}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ kind: "execution", ...row }));
}
