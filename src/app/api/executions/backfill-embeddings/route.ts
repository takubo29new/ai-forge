import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { embedDocuments } from "@/lib/voyage";
import { setExecutionEmbedding } from "@/lib/embeddings";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

// Phase 4より前に蓄積された既存のExecutionにはExecutionEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phase4-design.md参照)。
// 新規に成功したExecutionはPOST /api/prompts/:id/executeの中で都度埋め込みを作るため、
// このAPIは主に既存分のバックフィル用。対象はreviewIdが無い(Phase 2のレビュー実行ではない)
// SUCCESSなExecutionのみ(レビュー由来のresultTextはReviewCommentとして既に個別に
// 埋め込み済みのため対象外)。1回の呼び出しで最大LIST_LIMIT件処理し、残りがあれば
// remaining: trueを返すので、UI側はremainingがfalseになるまで繰り返し呼び出す想定。
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimit = await checkDocumentRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const executions = await prisma.execution.findMany({
    where: {
      userId,
      status: "SUCCESS",
      resultText: { not: null },
      review: null,
      embedding: null,
    },
    select: { id: true, resultText: true },
    take: LIST_LIMIT,
  });

  if (executions.length === 0) {
    return NextResponse.json({ processed: 0, remaining: false });
  }

  try {
    const embeddings = await embedDocuments(
      executions.map((e) => e.resultText as string),
    );
    await Promise.all(
      executions.map((e, i) => setExecutionEmbedding(e.id, embeddings[i])),
    );
  } catch (error) {
    return voyageErrorResponse(error, {
      path: "/api/executions/backfill-embeddings",
      userId,
    });
  }

  return NextResponse.json({
    processed: executions.length,
    remaining: executions.length === LIST_LIMIT,
  });
}
