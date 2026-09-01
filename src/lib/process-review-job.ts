import { getGitHubClient } from "@/lib/github";
import { runRepositoryReview } from "@/lib/run-repository-review";
import {
  createReviewNotification,
  createReviewSkippedNotification,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import type { ReviewTrigger } from "@/generated/prisma/client";

export type ReviewJobPayload = {
  repositoryId: string;
  userId: string;
  promptVersionId: string;
  pullRequestNumber: number;
  triggeredVia: ReviewTrigger;
};

// Webhook自動レビューの実処理(Vercel Queuesのコンシューマーから呼ぶ、Issue #106)。
// GitHub Webhook受信ルート(src/app/api/webhooks/github/[repositoryId]/route.ts)は
// ここをキューに積むだけで即座に200を返し、実際のAI呼び出し・DB書き込み・PRコメント
// 投稿は別の専用リクエスト(独立したVercel Function実行、独立した60秒枠)として
// 実行する。以前はWebhook受信と同じリクエストのafter()内で行っていたため、
// PR取得等の前処理・埋め込み生成等の後処理と合わせて60秒を使い切り、Vercelに
// 無言で強制終了されることがあった(2026-09-01, PR #125で発覚)。
export async function processReviewJob(payload: ReviewJobPayload): Promise<void> {
  const { repositoryId, userId, promptVersionId, pullRequestNumber, triggeredVia } = payload;

  const [repository, promptVersion] = await Promise.all([
    prisma.repository.findUnique({ where: { id: repositoryId } }),
    prisma.promptVersion.findUnique({ where: { id: promptVersionId } }),
  ]);
  // リポジトリ接続解除・プロンプト削除がキュー投入後~処理前の間に起きた場合は
  // 何もできないため静かに諦める(ユーザー操作による削除であり異常系ではない)。
  if (!repository || !promptVersion) return;

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    await createReviewSkippedNotification({
      userId,
      repositoryId,
      pullRequestNumber,
      reason: "GitHub連携情報が見つかりません",
    });
    return;
  }

  const result = await runRepositoryReview({
    octokit,
    repository: { id: repository.id, owner: repository.owner, name: repository.name },
    userId,
    promptVersion: { id: promptVersion.id, content: promptVersion.content },
    pullRequestNumber,
    triggeredVia,
  });

  if (result.status === "SUCCESS" || result.status === "FAILED") {
    await createReviewNotification({
      userId,
      reviewId: result.reviewId,
      pullRequestNumber,
      status: result.status,
    });
  } else {
    // FETCH_ERRORはrunRepositoryReview内で既にErrorLogへ記録済みだが、
    // Reviewが作成されないためユーザーからは何も起きていないように
    // 見えてしまう。他のスキップ経路と同様にNotificationでも知らせる。
    await createReviewSkippedNotification({
      userId,
      repositoryId,
      pullRequestNumber,
      reason: result.errorMessage,
    });
  }
}
