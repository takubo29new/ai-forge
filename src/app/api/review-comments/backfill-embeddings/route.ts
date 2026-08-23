import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { embedDocuments } from "@/lib/voyage";
import { setReviewCommentEmbedding } from "@/lib/embeddings";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";

// Phase 2で蓄積された既存のReviewCommentにはReviewCommentEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phase3-design.md参照)。
// 新規に作成されるReviewCommentはPOST /api/repositories/:id/reviewsの中で
// 都度埋め込みを作るため、このAPIは主に既存分のバックフィル用。1回の呼び出しで
// 最大LIST_LIMIT件処理し、残りがあればremaining: trueを返すので、UI側は
// remainingがfalseになるまで繰り返し呼び出す想定。
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

  const comments = await prisma.reviewComment.findMany({
    where: { review: { userId }, embedding: null },
    select: { id: true, body: true },
    take: LIST_LIMIT,
  });

  if (comments.length === 0) {
    return NextResponse.json({ processed: 0, remaining: false });
  }

  try {
    const embeddings = await embedDocuments(comments.map((c) => c.body));
    await Promise.all(
      comments.map((c, i) => setReviewCommentEmbedding(c.id, embeddings[i])),
    );
  } catch {
    return NextResponse.json(
      { error: "埋め込みの生成に失敗しました。もう一度お試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    processed: comments.length,
    remaining: comments.length === LIST_LIMIT,
  });
}
