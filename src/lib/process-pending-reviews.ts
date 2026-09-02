import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { runRepositoryReview } from "@/lib/run-repository-review";
import {
  createReviewNotification,
  createReviewSkippedNotification,
} from "@/lib/notifications";
import { logError } from "@/lib/error-log";

// Webhook自動レビューの非同期ワーカー本体(Issue #129)。GitHub Actionsの定期実行
// (.github/workflows/process-pending-reviews.yml、scripts/process-pending-reviews.mts経由)
// から呼ばれる想定で、Vercelの実行時間上限を受けない。status: PENDINGなReviewを
// 1件ずつ拾い、runRepositoryReview()にexistingReviewIdとして渡して結果を書き戻す。

// 1回の呼び出し(ワークフロー1run)で処理する件数の上限。無制限にすると1回のcronで
// 溜まったPENDINGを延々処理し続け、次のスケジュール実行と重なりうるため区切る。
const BATCH_LIMIT = 20;

async function claimNextPendingReview() {
  const pending = await prisma.review.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      repository: { select: { id: true, owner: true, name: true } },
      promptVersion: { select: { id: true, content: true } },
    },
  });
  if (!pending) return null;

  // 対象行がまだPENDINGのままの場合だけPROCESSINGへ更新する原子的なclaim。
  // ワークフロー側のconcurrency設定で通常は同時実行しないが、手動re-run等で
  // 重なった場合の多重処理防止として二重に保険をかけている。
  const claimed = await prisma.review.updateMany({
    where: { id: pending.id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return undefined; // 他の実行が先にclaim済み。呼び出し元でスキップして次を探す

  return pending;
}

type ClaimedReview = NonNullable<Awaited<ReturnType<typeof claimNextPendingReview>>>;

async function processReview(review: ClaimedReview): Promise<void> {
  const octokit = await getGitHubClient(review.userId);
  if (!octokit) {
    await prisma.review.update({
      where: { id: review.id },
      data: { status: "FAILED" },
    });
    await createReviewSkippedNotification({
      userId: review.userId,
      repositoryId: review.repositoryId,
      pullRequestNumber: review.pullRequestNumber,
      reason: "GitHub連携情報が見つかりません",
    }).catch(() => {});
    return;
  }

  const result = await runRepositoryReview({
    octokit,
    repository: review.repository,
    userId: review.userId,
    promptVersion: review.promptVersion,
    pullRequestNumber: review.pullRequestNumber,
    triggeredVia: review.triggeredVia,
    existingReviewId: review.id,
  });

  if (result.status === "SUCCESS" || result.status === "FAILED") {
    await createReviewNotification({
      userId: review.userId,
      reviewId: result.reviewId,
      pullRequestNumber: review.pullRequestNumber,
      status: result.status,
    }).catch(() => {});
  } else {
    // FETCH_ERRORの場合runRepositoryReview内でReviewは既にFAILEDへ更新済み。
    await createReviewSkippedNotification({
      userId: review.userId,
      repositoryId: review.repositoryId,
      pullRequestNumber: review.pullRequestNumber,
      reason: result.errorMessage,
    }).catch(() => {});
  }
}

export async function processPendingReviews(): Promise<{ processed: number }> {
  let processed = 0;

  while (processed < BATCH_LIMIT) {
    const review = await claimNextPendingReview();
    if (review === null) break; // PENDINGが無くなった
    if (review === undefined) continue; // claim失敗。次の候補へ

    try {
      await processReview(review);
    } catch (error) {
      await logError({
        source: "SERVER",
        message: `GitHub Actionsワーカーでのレビュー処理に失敗しました(reviewId: ${review.id}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        userId: review.userId,
      });
      await prisma.review
        .update({ where: { id: review.id }, data: { status: "FAILED" } })
        .catch(() => {});
    }

    processed += 1;
  }

  return { processed };
}
