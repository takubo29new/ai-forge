import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { checkExecutionRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { runRepositoryReview } from "@/lib/run-repository-review";

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

  const result = await runRepositoryReview({
    octokit,
    repository: { id: repository.id, owner: repository.owner, name: repository.name },
    userId,
    promptVersion: { id: promptVersion.id, content: promptVersion.content },
    pullRequestNumber,
    triggeredVia,
  });

  if (result.status === "FETCH_ERROR") {
    return NextResponse.json({ error: result.errorMessage }, { status: 502 });
  }
  if (result.status === "SUCCESS") {
    return NextResponse.json({ id: result.reviewId }, { status: 201 });
  }
  return NextResponse.json({ id: result.reviewId }, { status: 200 });
}
