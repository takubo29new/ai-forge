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
