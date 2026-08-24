import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient, listOpenPullRequests } from "@/lib/github";
import { logError } from "@/lib/error-log";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]/pulls">,
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

  const octokit = await getGitHubClient(session.user.id);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  try {
    const pulls = await listOpenPullRequests(
      octokit,
      repository.owner,
      repository.name,
    );
    return NextResponse.json(pulls);
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `オープンなPR一覧の取得に失敗しました(${repository.owner}/${repository.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/repositories/${id}/pulls`,
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: "オープンなPRの取得に失敗しました" },
      { status: 502 },
    );
  }
}
