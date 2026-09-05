import { prisma } from "@/lib/prisma";
import { createBatchEvaluationNotification } from "@/lib/notifications";
import { logError } from "@/lib/error-log";

// バッチAI評価(Issue #108)の完了判定・まとめ通知。実際のAI呼び出しは
// クライアントが1件ずつ既存のPOST /api/evaluationsを呼ぶ形(client-orchestrated)
// のため、サーバー側はEvaluationBatch.completedCountを原子的に進めるだけでよい。

type EvaluationBatchRow = {
  id: string;
  userId: string;
  total: number;
  completedCount: number;
  notifiedAt: Date | null;
  createdAt: Date;
};

async function bumpAndMaybeNotify(batchId: string) {
  // completedCountのincrementは、totalとの比較(2カラム比較)をPrisma Clientの
  // whereでは表現できないため生SQLで行う。WHERE句に"completedCount" < "total"を
  // 含めることで、リクエストの重複/リプレイでも1バッチの合計加算がtotalを
  // 超えない(RateLimitBucketのupsertと同様、Postgres側でその行へのUPDATEを
  // 直列化するため、複数の項目がほぼ同時に終端状態へ達しても取りこぼしなく
  // カウントできる)。
  const rows = await prisma.$queryRaw<EvaluationBatchRow[]>`
    UPDATE "EvaluationBatch"
    SET "completedCount" = "completedCount" + 1
    WHERE id = ${batchId} AND "completedCount" < "total"
    RETURNING *
  `;
  const updated = rows[0];
  if (!updated || updated.completedCount < updated.total) return;

  // カウントがtotalに達した後の「まとめ通知を送る権利」は、notifiedAt: nullを
  // 条件にしたupdateManyでclaimする(ReviewのPENDING→PROCESSING claim-loopと
  // 同じパターン)ため、複数の呼び出しが同時にcount>=totalを観測しても通知は
  // 1回しか送られない。
  const claimed = await prisma.evaluationBatch.updateMany({
    where: { id: batchId, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const evaluations = await prisma.evaluation.findMany({
    where: { batchId },
    select: { status: true },
  });
  const successCount = evaluations.filter((e) => e.status === "SUCCESS").length;

  try {
    await createBatchEvaluationNotification({
      userId: updated.userId,
      batchId,
      total: updated.total,
      successCount,
    });
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `バッチ評価完了の通知作成に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/evaluations",
      userId: updated.userId,
    });
  }
}

// 呼び出し元(route.ts)は常にこれをベストエフォートとして扱い、例外を投げない
// 前提でSUCCESS/FAILEDの確定処理を続ける。ここで例外を外に伝播させると、
// route.tsのバックグラウンドタスクの外側catchが「評価自体の実行に失敗した」
// と誤解し、直前に確定させたSUCCESSをFAILEDへ上書きしてしまうため、ここで
// 確実に飲み込む。
async function runBestEffort(batchId: string, label: string) {
  try {
    await bumpAndMaybeNotify(batchId);
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `バッチ完了カウンタの更新(${label})に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/evaluations",
    });
  }
}

// 実際にEvaluationが作られ、終端状態(SUCCESS/FAILED)に達した場合に呼ぶ。
export async function recordBatchItemCompleted(batchId: string) {
  await runBestEffort(batchId, "completed");
}

// バリデーション/レート制限でEvaluation行自体が作られなかった場合に呼ぶ
// (route.tsのfail()ヘルパーから呼ばれる)。totalは「送信を予定していた件数」
// であり、弾かれた分も終端状態の一種として扱わないとバッチが永遠に完了しない。
export async function recordBatchItemSkipped(batchId: string) {
  await runBestEffort(batchId, "skipped");
}
