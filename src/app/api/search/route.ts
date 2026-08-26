import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// 横断検索(Cmd/Ctrl+Kのコマンドパレット用)。プロンプト・カテゴリ・リポジトリ・
// ドキュメント・評価・レビューを対象に、タイトル/名前の部分一致(大文字小文字を
// 区別しない)で検索する。AI呼び出しを伴わない単純な一覧クエリのため、他の
// 一覧系エンドポイントと同様にレート制限は設けていない。
const LIMIT = 5;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({
      prompts: [],
      categories: [],
      repositories: [],
      documents: [],
      evaluations: [],
      reviews: [],
    });
  }

  const [prompts, categories, repositories, documents, evaluations, reviews] =
    await Promise.all([
      prisma.prompt.findMany({
        where: { userId, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: LIMIT,
      }),
      prisma.category.findMany({
        where: { userId, name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true },
        take: LIMIT,
      }),
      prisma.repository.findMany({
        where: {
          userId,
          OR: [
            { owner: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, owner: true, name: true },
        take: LIMIT,
      }),
      prisma.document.findMany({
        where: { userId, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
        take: LIMIT,
      }),
      prisma.evaluation.findMany({
        where: { userId, title: { contains: q, mode: "insensitive" } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      }),
      prisma.review.findMany({
        where: { userId, pullRequestTitle: { contains: q, mode: "insensitive" } },
        select: { id: true, pullRequestNumber: true, pullRequestTitle: true },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      }),
    ]);

  return NextResponse.json({
    prompts: prompts.map((p) => ({ id: p.id, label: p.title })),
    categories: categories.map((c) => ({ id: c.id, label: c.name })),
    repositories: repositories.map((r) => ({ id: r.id, label: `${r.owner}/${r.name}` })),
    documents: documents.map((d) => ({ id: d.id, label: d.title })),
    evaluations: evaluations.map((e) => ({ id: e.id, label: e.title })),
    reviews: reviews.map((r) => ({
      id: r.id,
      label: `#${r.pullRequestNumber} ${r.pullRequestTitle}`,
    })),
  });
}
