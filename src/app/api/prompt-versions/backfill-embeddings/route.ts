import { prisma } from "@/lib/prisma";
import { setPromptVersionEmbedding } from "@/lib/embeddings";
import { LIST_LIMIT } from "@/lib/list-limits";
import { handleBackfillEmbeddings } from "@/lib/backfill-embeddings";

// Phase 4より前に蓄積された既存のPromptVersionにはPromptVersionEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phase4-design.md参照)。
// 新規に保存されるPromptVersionはPATCH /api/prompts/:idの中で都度埋め込みを作るため、
// このAPIは主に既存分のバックフィル用。1回の呼び出しで最大LIST_LIMIT件処理し、
// 残りがあればremaining: trueを返すので、UI側はremainingがfalseになるまで繰り返し呼び出す想定。
export async function POST() {
  return handleBackfillEmbeddings(
    "/api/prompt-versions/backfill-embeddings",
    (userId) =>
      prisma.promptVersion.findMany({
        where: { prompt: { userId }, embedding: null },
        select: { id: true, content: true },
        take: LIST_LIMIT,
      }),
    (v) => v.content,
    setPromptVersionEmbedding,
  );
}
