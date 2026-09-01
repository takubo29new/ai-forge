import { handleCallback } from "@vercel/queue";
import { processReviewJob, type ReviewJobPayload } from "@/lib/process-review-job";
import { logError } from "@/lib/error-log";

// Vercel Queues(Beta)のプッシュ型コンシューマー。GitHub Webhook受信ルートから
// send()で積まれたジョブをここで処理する(vercel.jsonのexperimentalTriggersで
// このルートをトピックに紐付ける)。Vercelのキュー基盤からのみ呼び出せる非公開
// エンドポイントで、公開URLとしては到達できない(docs/queues/sdk参照)。
export const maxDuration = 60;

export const POST = handleCallback(async (message, metadata) => {
  const payload = message as ReviewJobPayload;
  try {
    await processReviewJob(payload);
  } catch (error) {
    // Queuesは失敗(例外)したメッセージを再配送するが、runRepositoryReview()の
    // 各ステップは既に個別にエラーハンドリング済みで、ここまで例外が届くのは
    // DB接続断等の想定外ケースのみ。再配送に頼るとPRコメント二重投稿等の
    // 副作用が起きうるため、ログに残した上で再送はさせない(ack扱いにする)。
    await logError({
      source: "SERVER",
      message: `Webhook自動レビューのジョブ処理に失敗しました(messageId=${metadata.messageId}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/queues/review-jobs",
      userId: payload.userId,
    });
  }
});
