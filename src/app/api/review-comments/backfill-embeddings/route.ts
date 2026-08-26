import { prisma } from "@/lib/prisma";
import { setReviewCommentEmbedding } from "@/lib/embeddings";
import { LIST_LIMIT } from "@/lib/list-limits";
import { handleBackfillEmbeddings } from "@/lib/backfill-embeddings";

// Phase 2で蓄積された既存のReviewCommentにはReviewCommentEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phases/phase3-design.md参照)。
// 新規に作成されるReviewCommentはPOST /api/repositories/:id/reviewsの中で
// 都度埋め込みを作るため、このAPIは主に既存分のバックフィル用。1回の呼び出しで
// 最大LIST_LIMIT件処理し、残りがあればremaining: trueを返すので、UI側は
// remainingがfalseになるまで繰り返し呼び出す想定。
export async function POST() {
  return handleBackfillEmbeddings(
    "/api/review-comments/backfill-embeddings",
    (userId) =>
      prisma.reviewComment.findMany({
        where: { review: { userId }, embedding: null },
        select: { id: true, body: true },
        take: LIST_LIMIT,
      }),
    (c) => c.body,
    setReviewCommentEmbedding,
  );
}
