import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_BATCH_SIZE } from "@/lib/evaluation-batch-limits";

// バッチAI評価(Issue #108)の宣言用エンドポイント。実際のAI呼び出しは
// クライアントがこのbatchIdを添えて既存のPOST /api/evaluationsを1件ずつ
// 呼ぶ(client-orchestrated、src/lib/evaluation-batch.ts参照)。ここでは
// 「予定件数(total)」を確定させ、完了カウンタの初期値を持つ行を作るだけ。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const total =
    typeof body?.total === "number" ? Math.trunc(body.total) : NaN;

  if (!Number.isFinite(total) || total < 2 || total > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `バッチのファイル数は2〜${MAX_BATCH_SIZE}件で指定してください` },
      { status: 400 },
    );
  }

  // このエンドポイントは軽量なカウンタ行(EvaluationBatch)を作るだけで実際の
  // AI呼び出しを行わないため、専用のレート制限は設けていない。実コストが
  // かかる呼び出しは既存のcheckEvaluationRateLimit(POST /api/evaluations側、
  // 1件ずつ)で制限される。
  const batch = await prisma.evaluationBatch.create({
    data: { userId, total },
  });

  return NextResponse.json(
    { batchId: batch.id, total: batch.total },
    { status: 201 },
  );
}
