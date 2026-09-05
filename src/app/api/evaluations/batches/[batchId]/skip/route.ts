import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordBatchItemSkipped } from "@/lib/evaluation-batch";

// バッチAI評価(Issue #108)。ファイル読み込みやネットワーク断でPOST
// /api/evaluations自体がサーバーに届かなかった場合、クライアントが
// ベストエフォートでここを呼び、完了カウンタだけ進めておく(サーバー側の
// バリデーション/レート制限による弾かれ方と違い、サーバーはこの項目の存在を
// 一切知らないため、クライアントから明示的に知らせないとバッチが永遠に
// totalへ到達しない)。
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/evaluations/batches/[batchId]/skip">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { batchId } = await ctx.params;
  const batch = await prisma.evaluationBatch.findFirst({
    where: { id: batchId, userId: session.user.id },
  });
  if (!batch) {
    return NextResponse.json({ error: "バッチが見つかりません" }, { status: 404 });
  }

  await recordBatchItemSkipped(batchId);

  return new NextResponse(null, { status: 204 });
}
