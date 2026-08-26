import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

// review-comments/prompt-versions/executionsのbackfill-embeddingsルートで共通の
// 「認証→レート制限→対象取得→埋め込み生成→書き込み→processed/remaining応答」の流れをまとめたもの。
// 対象の取得条件・埋め込み対象のテキスト・書き込み方法だけがルートごとに異なる。
export async function handleBackfillEmbeddings<T extends { id: string }>(
  path: string,
  fetchItems: (userId: string) => Promise<T[]>,
  getText: (item: T) => string,
  setEmbedding: (id: string, embedding: number[]) => Promise<void>,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimit = await checkDocumentRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const items = await fetchItems(userId);
  if (items.length === 0) {
    return NextResponse.json({ processed: 0, remaining: false });
  }

  try {
    const embeddings = await embedDocuments(items.map(getText));
    await Promise.all(
      items.map((item, i) => setEmbedding(item.id, embeddings[i])),
    );
  } catch (error) {
    return voyageErrorResponse(error, { path, userId });
  }

  return NextResponse.json({
    processed: items.length,
    remaining: items.length === LIST_LIMIT,
  });
}
