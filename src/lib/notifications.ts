import { prisma } from "@/lib/prisma";

// バックグラウンド処理(AI評価・Webhook自動レビュー)の完了を通知センターに
// 残すためのヘルパー群。呼び出し元は本処理と切り離したベストエフォートとして
// 呼び出し、失敗してもEvaluation/Review自体のステータス更新には影響させない。
export async function createEvaluationNotification({
  userId,
  evaluationId,
  title,
  status,
}: {
  userId: string;
  evaluationId: string;
  title: string;
  status: "SUCCESS" | "FAILED";
}) {
  await prisma.notification.create({
    data: {
      userId,
      message:
        status === "SUCCESS"
          ? `評価「${title}」が完了しました`
          : `評価「${title}」の実行に失敗しました`,
      link: `/evaluations/${evaluationId}`,
    },
  });
}

// バッチAI評価(Issue #108)の完了通知。バッチに属する個々のEvaluationは
// createEvaluationNotificationを呼ばず(通知センターがバッチのファイル数分
// 埋まってしまうのを避けるため)、バッチ全体が終端状態に達した時点でこちらを
// 1回だけ呼ぶ(src/lib/evaluation-batch.tsのrecordBatchItemCompleted/Skipped参照)。
export async function createBatchEvaluationNotification({
  userId,
  batchId,
  total,
  successCount,
}: {
  userId: string;
  batchId: string;
  total: number;
  successCount: number;
}) {
  await prisma.notification.create({
    data: {
      userId,
      message: `バッチ評価(${total}件)が完了しました(成功${successCount}件)`,
      link: `/evaluations/batches/${batchId}`,
    },
  });
}

// Webhook自動レビュー(Issue #106)の完了通知。手動実行はUI側で結果を
// 直接表示するため通知しないが、Webhookはユーザーが操作していないタイミングで
// バックグラウンド実行されるため、完了をNotificationで知らせる。
export async function createReviewNotification({
  userId,
  reviewId,
  pullRequestNumber,
  status,
}: {
  userId: string;
  reviewId: string;
  pullRequestNumber: number;
  status: "SUCCESS" | "FAILED";
}) {
  await prisma.notification.create({
    data: {
      userId,
      message:
        status === "SUCCESS"
          ? `PR #${pullRequestNumber} の自動レビューが完了しました`
          : `PR #${pullRequestNumber} の自動レビューに失敗しました`,
      link: `/reviews/${reviewId}`,
    },
  });
}

// Webhookは受け取ったがレビューを実行しなかった(できなかった)場合の通知。
// レビュー自体は作成されないためlinkはWebhook設定タブに向ける。
export async function createReviewSkippedNotification({
  userId,
  repositoryId,
  pullRequestNumber,
  reason,
}: {
  userId: string;
  repositoryId: string;
  pullRequestNumber: number;
  reason: string;
}) {
  await prisma.notification.create({
    data: {
      userId,
      message: `PR #${pullRequestNumber} の自動レビューをスキップしました(${reason})`,
      link: `/repositories/${repositoryId}?tab=webhook`,
    },
  });
}
