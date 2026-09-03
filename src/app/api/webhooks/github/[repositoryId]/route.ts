import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/github-webhook";
import { decryptToken } from "@/lib/token-crypto";
import { checkExecutionRateLimit } from "@/lib/rate-limit";
import { createPendingReview } from "@/lib/run-repository-review";
import { createReviewSkippedNotification } from "@/lib/notifications";
import { logError } from "@/lib/error-log";
import { getGitHubClient } from "@/lib/github";
import { triggerReviewWorker } from "@/lib/trigger-review-worker";

// GitHubからのWebhook受信(Issue #106)。セッション認証は無く、代わりに
// リポジトリごとに生成したsecretでX-Hub-Signature-256を検証する
// (docs/phases/phase2-design.md「Webhook自動レビュー」参照)。
//
// GitHubは配信失敗(4xx/5xx)が続くとWebhookを自動的に無効化するため、
// 署名不一致(401)以外の「ai-forge側で意図的にスキップした」ケースは
// すべて200を返す。
//
// 実際のAIレビュー処理はここでは行わず、Review行をstatus: PENDINGで
// 作成するだけに留める(Issue #129)。処理はGitHub Actionsの定期実行
// ワーカー(scripts/process-pending-reviews.mts → src/lib/process-pending-reviews.ts)
// が別途拾って行うため、Vercelの実行時間上限(旧: max duration 60秒)の影響を受けない。

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

  const pullRequestPayload =
    typeof payload === "object" && payload !== null && "pull_request" in payload
      ? (
          payload as {
            pull_request?: {
              number?: unknown;
              title?: unknown;
              html_url?: unknown;
              head?: { sha?: unknown };
            };
          }
        ).pull_request
      : null;
  const pullRequestNumber =
    typeof pullRequestPayload?.number === "number" ? pullRequestPayload.number : null;
  const pullRequestTitle =
    typeof pullRequestPayload?.title === "string" ? pullRequestPayload.title : null;
  const pullRequestUrl =
    typeof pullRequestPayload?.html_url === "string" ? pullRequestPayload.html_url : null;
  const headSha =
    typeof pullRequestPayload?.head?.sha === "string" ? pullRequestPayload.head.sha : null;
  if (
    pullRequestNumber === null ||
    pullRequestTitle === null ||
    pullRequestUrl === null ||
    headSha === null
  ) {
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

  try {
    await createPendingReview({
      repository: { id: repository.id },
      userId,
      promptVersionId: promptVersion.id,
      pullRequest: {
        number: pullRequestNumber,
        title: pullRequestTitle,
        url: pullRequestUrl,
        headSha,
      },
      triggeredVia: "WEBHOOK",
    });

    const octokit = await getGitHubClient(userId);
    if (octokit) {
      await triggerReviewWorker(octokit, userId);
    }
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `Webhook自動レビューのReview作成(PENDING)に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/webhooks/github/${repository.id}`,
      userId,
    });
  }

  return NextResponse.json({ ok: true });
}
