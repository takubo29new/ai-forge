import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { embedDocuments } from "@/lib/voyage";
import { setPromptVersionEmbedding } from "@/lib/embeddings";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

// Phase 4より前に蓄積された既存のPromptVersionにはPromptVersionEmbeddingが無いため、
// RAG検索チャットの検索対象にするための一括埋め込み生成(docs/phase4-design.md参照)。
// 新規に保存されるPromptVersionはPATCH /api/prompts/:idの中で都度埋め込みを作るため、
// このAPIは主に既存分のバックフィル用。1回の呼び出しで最大LIST_LIMIT件処理し、
// 残りがあればremaining: trueを返すので、UI側はremainingがfalseになるまで繰り返し呼び出す想定。
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

  const versions = await prisma.promptVersion.findMany({
    where: { prompt: { userId }, embedding: null },
    select: { id: true, content: true },
    take: LIST_LIMIT,
  });

  if (versions.length === 0) {
    return NextResponse.json({ processed: 0, remaining: false });
  }

  try {
    const embeddings = await embedDocuments(versions.map((v) => v.content));
    await Promise.all(
      versions.map((v, i) => setPromptVersionEmbedding(v.id, embeddings[i])),
    );
  } catch (error) {
    return voyageErrorResponse(error, {
      path: "/api/prompt-versions/backfill-embeddings",
      userId,
    });
  }

  return NextResponse.json({
    processed: versions.length,
    remaining: versions.length === LIST_LIMIT,
  });
}
