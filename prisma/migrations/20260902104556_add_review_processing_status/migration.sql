-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'PROCESSING';

-- 注意: `prisma migrate dev`が生成した元の差分には、DocumentChunk/ReviewCommentEmbedding/
-- PromptVersionEmbedding/ExecutionEmbeddingのHNSWインデックスへのDROP INDEXが含まれていた。
-- これらは生SQLで手動追加したインデックス(20260823224800_add_phase3_rag_schema・
-- 20260824062119_add_phase4_rag_embeddings参照)でPrismaのスキーマ差分検知が
-- 認識できず、消えたものとして扱われるため。既存インデックスを消さないよう取り除いてある
-- (20260824062119_add_phase4_rag_embeddingsと同じ対応)。
