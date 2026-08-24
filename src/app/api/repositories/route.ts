import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { logError } from "@/lib/error-log";

function serializeRepository(repo: {
  id: string;
  githubRepoId: bigint;
  owner: string;
  name: string;
  defaultBranch: string | null;
  connectedAt: Date;
  _count?: { reviews: number };
}) {
  return {
    id: repo.id,
    githubRepoId: repo.githubRepoId.toString(),
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    connectedAt: repo.connectedAt,
    reviewCount: repo._count?.reviews ?? 0,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const repositories = await prisma.repository.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { reviews: true } } },
    orderBy: { connectedAt: "desc" },
  });

  return NextResponse.json(repositories.map(serializeRepository));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!owner || !name) {
    return NextResponse.json(
      { error: "リポジトリを指定してください" },
      { status: 400 },
    );
  }

  const octokit = await getGitHubClient(session.user.id);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  // クライアントから渡された値をそのまま信用せず、GitHub API で存在・アクセス権を確認する
  let repoInfo;
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo: name });
    repoInfo = data;
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `GitHubリポジトリ情報の取得に失敗しました(${owner}/${name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/repositories",
      method: "POST",
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: "指定されたリポジトリにアクセスできませんでした" },
      { status: 400 },
    );
  }

  try {
    const repository = await prisma.repository.create({
      data: {
        userId: session.user.id,
        githubRepoId: BigInt(repoInfo.id),
        owner: repoInfo.owner.login,
        name: repoInfo.name,
        defaultBranch: repoInfo.default_branch,
      },
      include: { _count: { select: { reviews: true } } },
    });
    return NextResponse.json(serializeRepository(repository), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "このリポジトリは既に接続されています" },
      { status: 409 },
    );
  }
}
