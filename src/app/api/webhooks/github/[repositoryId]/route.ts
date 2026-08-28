import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { verifyWebhookSignature } from "@/lib/github-webhook";
import { decryptToken } from "@/lib/token-crypto";
import { checkExecutionRateLimit } from "@/lib/rate-limit";
import { runRepositoryReview } from "@/lib/run-repository-review";
import { scheduleBackground } from "@/lib/schedule-background";
import {
  createReviewNotification,
  createReviewSkippedNotification,
} from "@/lib/notifications";
import { logError } from "@/lib/error-log";

// GitHubからのWebhook受信(Issue #106)。セッション認証は無く、代わりに
// リポジトリごとに生成したsecretでX-Hub-Signature-256を検証する
// (docs/phases/phase2-design.md「Webhook自動レビュー」参照)。
//
// GitHubは配信失敗(4xx/5xx)が続くとWebhookを自動的に無効化するため、
// 署名不一致(401)以外の「ai-forge側で意図的にスキップした」ケースは
// すべて200を返す。実際のレビュー処理はGitHubの既定の配信タイムアウト
// (10秒)に収めるため、scheduleBackground()でバックグラウンド実行する。
export const maxDuration = 60;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/webhooks/github/[repositoryId]">,
) {
  const { repositoryId } = await ctx.params;

  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });
  if (!repository || !repository.webhookEnabled || !repository.webhookSecret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 署名検証は生のリクエストボディに対して行う必要があるため、JSONとして
  // 解釈するのは検証が通った後にする(検証前のペイロード内容を信用しない)。
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // TOKEN_ENCRYPTION_KEYのローテーション等でwebhookSecretの復号に失敗しうる
  // (AES-GCMの認証タグ検証エラーは例外を投げる)。ここで捕まえず伝播させると
  // 生の例外で500になり、GitHubは配信失敗として扱い続けWebhookを自動無効化
  // してしまうため、署名不一致と同じ401(意図的な拒否)として扱う。
  let secret: string;
  try {
    secret = decryptToken(repository.webhookSecret);
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `Webhook secretの復号に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/webhooks/github/${repository.id}`,
      userId: repository.userId,
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  if (eventName === "ping") {
    return NextResponse.json({ ok: true });
  }
  if (eventName !== "pull_request") {
    return NextResponse.json({ ok: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const action =
    typeof payload === "object" && payload !== null && "action" in payload
      ? (payload as { action: unknown }).action
      : null;
  if (action !== "opened" && action !== "synchronize") {
    return NextResponse.json({ ok: true });
  }

  const pullRequestNumber =
    typeof payload === "object" &&
    payload !== null &&
    "pull_request" in payload &&
    typeof (payload as { pull_request?: { number?: unknown } }).pull_request
      ?.number === "number"
      ? (payload as { pull_request: { number: number } }).pull_request.number
      : null;
  if (pullRequestNumber === null) {
    return NextResponse.json({ ok: true });
  }

  const userId = repository.userId;

  if (!repository.defaultPromptId) {
    await createReviewSkippedNotification({
      userId,
      repositoryId: repository.id,
      pullRequestNumber,
      reason: "デフォルトプロンプトが未設定です",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const promptVersion = await prisma.promptVersion.findFirst({
    where: { prompt: { id: repository.defaultPromptId, userId } },
    orderBy: { versionNumber: "desc" },
  });
  if (!promptVersion) {
    await createReviewSkippedNotification({
      userId,
      repositoryId: repository.id,
      pullRequestNumber,
      reason: "デフォルトプロンプトが見つかりません",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const rateLimit = await checkExecutionRateLimit(userId);
  if (!rateLimit.allowed) {
    await createReviewSkippedNotification({
      userId,
      repositoryId: repository.id,
      pullRequestNumber,
      reason: "実行回数の上限に達しています",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  await scheduleBackground(async () => {
    try {
      const octokit = await getGitHubClient(userId);
      if (!octokit) {
        await createReviewSkippedNotification({
          userId,
          repositoryId: repository.id,
          pullRequestNumber,
          reason: "GitHub連携情報が見つかりません",
        });
        return;
      }

      const result = await runRepositoryReview({
        octokit,
        repository: {
          id: repository.id,
          owner: repository.owner,
          name: repository.name,
        },
        userId,
        promptVersion: { id: promptVersion.id, content: promptVersion.content },
        pullRequestNumber,
        triggeredVia: "WEBHOOK",
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
          repositoryId: repository.id,
          pullRequestNumber,
          reason: result.errorMessage,
        });
      }
    } catch (error) {
      await logError({
        source: "SERVER",
        message: `Webhook自動レビューのバックグラウンド実行に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
        path: `/api/webhooks/github/${repository.id}`,
        userId,
      });
    }
  });

  return NextResponse.json({ ok: true });
}
