import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const octokit = await getGitHubClient(session.user.id);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  const connected = await prisma.repository.findMany({
    where: { userId: session.user.id },
    select: { githubRepoId: true },
  });
  const connectedIds = new Set(connected.map((r) => r.githubRepoId.toString()));

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 50,
    });

    const repos = data
      .filter((r) => !connectedIds.has(r.id.toString()))
      .map((r) => ({
        githubRepoId: r.id.toString(),
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
      }));

    return NextResponse.json(repos);
  } catch {
    return NextResponse.json(
      {
        error:
          "GitHubリポジトリの取得に失敗しました。権限が不足している場合は、ログアウトして再度ログインしてください。",
      },
      { status: 502 },
    );
  }
}
