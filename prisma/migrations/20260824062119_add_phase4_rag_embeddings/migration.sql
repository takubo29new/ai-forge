-- CreateTable
CREATE TABLE "PromptVersionEmbedding" (
    "promptVersionId" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersionEmbedding_pkey" PRIMARY KEY ("promptVersionId")
);

-- CreateTable
CREATE TABLE "ExecutionEmbedding" (
    "executionId" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEmbedding_pkey" PRIMARY KEY ("executionId")
);

-- AddForeignKey
ALTER TABLE "PromptVersionEmbedding" ADD CONSTRAINT "PromptVersionEmbedding_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEmbedding" ADD CONSTRAINT "ExecutionEmbedding_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 類似検索用のHNSWインデックス(コサイン距離)。Prismaの@@indexはpgvector専用の
-- インデックス種別(hnsw/ivfflat)を宣言できないため、生SQLで追加する
-- (20260823224800_add_phase3_rag_schemaと同じパターン)。
-- 注意: `prisma migrate dev`が生成した元の差分には、DocumentChunk/ReviewCommentEmbedding
-- の既存HNSWインデックスに対するDROP INDEXが含まれていた(Unsupported型の列に
-- 手動追加したインデックスをPrismaのスキーマ差分が検知できず、消えたものとして
-- 扱われるため)。既存インデックスを消さないよう、そのDROP INDEXは取り除いてある。
CREATE INDEX "PromptVersionEmbedding_embedding_hnsw_idx" ON "PromptVersionEmbedding" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "ExecutionEmbedding_embedding_hnsw_idx" ON "ExecutionEmbedding" USING hnsw ("embedding" vector_cosine_ops);
