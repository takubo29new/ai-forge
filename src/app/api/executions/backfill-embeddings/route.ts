import { prisma } from "@/lib/prisma";
import { setExecutionEmbedding } from "@/lib/embeddings";
import { LIST_LIMIT } from "@/lib/list-limits";
import { handleBackfillEmbeddings } from "@/lib/backfill-embeddings";

// Phase 4より前に蓄積された既存のExecutionにはExecutionEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phases/phase4-design.md参照)。
// 新規に成功したExecutionはPOST /api/prompts/:id/executeの中で都度埋め込みを作るため、
// このAPIは主に既存分のバックフィル用。対象はreviewIdが無い(Phase 2のレビュー実行ではない)・
// evaluationIdが無い(Phase 5のAI評価実行ではない)SUCCESSなExecutionのみ。レビュー由来の
// resultTextはReviewCommentとして既に個別に埋め込み済みのため対象外、AI評価由来の
// resultTextはEvaluationOutputSchema由来の平文プレースホルダーでしかなく(実体は
// Evaluation.summary/EvaluationFinding.bodyとして暗号化保存)検索対象として意味を
// 持たないため対象外にしている。1回の呼び出しで最大LIST_LIMIT件処理し、残りがあれば
// remaining: trueを返すので、UI側はremainingがfalseになるまで繰り返し呼び出す想定。
export async function POST() {
  return handleBackfillEmbeddings(
    "/api/executions/backfill-embeddings",
    (userId) =>
      prisma.execution.findMany({
        where: {
          userId,
          status: "SUCCESS",
          resultText: { not: null },
          review: null,
          evaluation: null,
          embedding: null,
        },
        select: { id: true, resultText: true },
        take: LIST_LIMIT,
      }),
    (e) => e.resultText as string,
    setExecutionEmbedding,
  );
}
