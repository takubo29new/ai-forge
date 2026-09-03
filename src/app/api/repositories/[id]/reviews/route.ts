import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient, getPullRequest } from "@/lib/github";
import { checkExecutionRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { createPendingReview } from "@/lib/run-repository-review";
import { triggerReviewWorker } from "@/lib/trigger-review-worker";

// POSTはPR取得(GitHub API呼び出し)までしか行わない。以前はClaude呼び出しまで
// 直接awaitしていたが、Vercel Hobbyプランのmax duration(60秒)内に収まらない
// ケース(16000トークン出力時に実測68秒)があり、無視できない頻度でタイムアウト
// 失敗していた。WebhookルートやGitHub Actionsワーカーと同じPENDING作成方式に
// 統一し、実処理(AIレビュー・PRコメント投稿)はtriggerReviewWorker()で即時起動
// するGitHub Actions側(src/lib/process-pending-reviews.ts)に任せる。

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]/reviews">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== session.user.id) {
    return NextResponse.json(
      { error: "リポジトリが見つかりません" },
      { status: 404 },
    );
  }

  const reviews = await prisma.review.findMany({
    where: { repositoryId: id },
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return NextResponse.json(reviews);
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/repositories/[id]/reviews">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await ctx.params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== userId) {
    return NextResponse.json(
      { error: "リポジトリが見つかりません" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const pullRequestNumber =
    typeof body.pullRequestNumber === "number" ? body.pullRequestNumber : null;
  const promptId = typeof body.promptId === "string" ? body.promptId : null;
  // チャット経由の実行(Phase 4項目4)を履歴上で区別するためのトリガー元。
  // "CHAT"以外の値・未指定はすべて既定のUI実行として扱う。
  const triggeredVia = body.triggeredVia === "CHAT" ? "CHAT" : "UI";

  if (!pullRequestNumber || !promptId) {
    return NextResponse.json(
      { error: "PRとプロンプトを指定してください" },
      { status: 400 },
    );
  }

  const promptVersion = await prisma.promptVersion.findFirst({
    where: { prompt: { id: promptId, userId } },
    orderBy: { versionNumber: "desc" },
  });
  if (!promptVersion) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 400 },
    );
  }
  if (!promptVersion.content.includes("{{diff}}")) {
    return NextResponse.json(
      {
        error:
          "選択したプロンプトの本文に{{diff}}が含まれていないため、コード差分を渡せません。プロンプトを編集して{{diff}}を追加してください。",
      },
      { status: 400 },
    );
  }

  const rateLimit = await checkExecutionRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  let pullRequest;
  try {
    pullRequest = await getPullRequest(
      octokit,
      repository.owner,
      repository.name,
      pullRequestNumber,
    );
  } catch {
    return NextResponse.json({ error: "PRの取得に失敗しました" }, { status: 502 });
  }

  const review = await createPendingReview({
    repository: { id: repository.id },
    userId,
    promptVersionId: promptVersion.id,
    pullRequest,
    triggeredVia,
  });

  await triggerReviewWorker(octokit, userId);

  return NextResponse.json({ id: review.id }, { status: 202 });
}
