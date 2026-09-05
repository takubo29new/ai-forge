-- 注意: `prisma migrate dev`が生成した元の差分には、DocumentChunk/ReviewCommentEmbedding/
-- PromptVersionEmbedding/ExecutionEmbeddingのHNSWインデックスへのDROP INDEXが含まれていた。
-- これらは生SQLで手動追加したインデックス(20260823224800_add_phase3_rag_schema・
-- 20260824062119_add_phase4_rag_embeddings参照)でPrismaのスキーマ差分検知が
-- 認識できず、消えたものとして扱われるため。既存インデックスを消さないよう取り除いてある
-- (20260824062119_add_phase4_rag_embeddings・20260902104556_add_review_processing_statusと同じ対応)。

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "EvaluationBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationBatch_userId_idx" ON "EvaluationBatch"("userId");

-- CreateIndex
CREATE INDEX "Evaluation_batchId_idx" ON "Evaluation"("batchId");

-- AddForeignKey
ALTER TABLE "EvaluationBatch" ADD CONSTRAINT "EvaluationBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EvaluationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
