import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recordBatchItemCompleted } from "@/lib/evaluation-batch";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/evaluations/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      execution: true,
      findings: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!evaluation || evaluation.userId !== session.user.id) {
    return NextResponse.json(
      { error: "評価が見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json(evaluation);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/evaluations/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const evaluation = await prisma.evaluation.findUnique({ where: { id } });
  if (!evaluation || evaluation.userId !== session.user.id) {
    return NextResponse.json(
      { error: "評価が見つかりません" },
      { status: 404 },
    );
  }

  // 所有権チェック用に先に取得したevaluationのstatusは取得時点のスナップショット
  // であり、削除までの間にバックグラウンド処理がSUCCESS/FAILEDへ更新している
  // かもしれない(その場合は既にrecordBatchItemCompletedが呼ばれている)。
  // delete()の返り値(削除直前の行)で判定することで、取得→削除間の競合窓を
  // 狭める。
  const deleted = await prisma.evaluation.delete({ where: { id } });

  // バッチAI評価(Issue #108)。まだPENDINGのバッチ項目を削除すると、その項目は
  // 二度と終端状態(SUCCESS/FAILED)に達しないため、削除時点で完了カウンタを
  // 進めておかないとバッチが永遠にtotalへ到達せずまとめ通知が送られない。
  if (deleted.batchId && deleted.status === "PENDING") {
    await recordBatchItemCompleted(deleted.batchId);
  }

  return new NextResponse(null, { status: 204 });
}
