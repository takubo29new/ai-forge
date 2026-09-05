import { prisma } from "@/lib/prisma";
import { createBatchEvaluationNotification } from "@/lib/notifications";
import { logError } from "@/lib/error-log";

// バッチAI評価(Issue #108)の完了判定・まとめ通知。実際のAI呼び出しは
// クライアントが1件ずつ既存のPOST /api/evaluationsを呼ぶ形(client-orchestrated)
// のため、サーバー側はEvaluationBatch.completedCountを原子的に進めるだけでよい。
//
// completedCountのincrementはPostgres側でその行へのUPDATEを直列化するため
// (RateLimitBucketのupsertと同じ考え方)、複数の項目がほぼ同時に終端状態へ
// 達しても取りこぼしなくカウントできる。カウントがtotalに達した後の
// 「まとめ通知を送る権利」は、notifiedAt: nullを条件にしたupdateManyで
// claimする(ReviewのPENDING→PROCESSING claim-loopと同じパターン)ため、
// 複数の呼び出しが同時にcount>=totalを観測しても通知は1回しか送られない。
async function bumpAndMaybeNotify(batchId: string) {
  const updated = await prisma.evaluationBatch.update({
    where: { id: batchId },
    data: { completedCount: { increment: 1 } },
  });

  if (updated.completedCount < updated.total) return;

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

// 実際にEvaluationが作られ、終端状態(SUCCESS/FAILED)に達した場合に呼ぶ。
export async function recordBatchItemCompleted(batchId: string) {
  await bumpAndMaybeNotify(batchId);
}

// バリデーション/レート制限でEvaluation行自体が作られなかった場合に呼ぶ
// (route.tsのfail()ヘルパーから呼ばれる)。totalは「送信を予定していた件数」
// であり、弾かれた分も終端状態の一種として扱わないとバッチが永遠に完了しない。
export async function recordBatchItemSkipped(batchId: string) {
  await bumpAndMaybeNotify(batchId);
}
