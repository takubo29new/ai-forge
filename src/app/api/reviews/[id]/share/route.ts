import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/share-token";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/reviews/[id]/share">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review || review.userId !== session.user.id) {
    return NextResponse.json(
      { error: "レビューが見つかりません" },
      { status: 404 },
    );
  }

  if (review.status !== "SUCCESS") {
    return NextResponse.json(
      { error: "成功したレビューのみ共有できます" },
      { status: 400 },
    );
  }

  // 既に共有済みなら同じトークンを返す(冪等)。押すたびにURLが変わると
  // 既に共有済みのリンクが意図せず失効してしまうため。
  if (review.shareToken) {
    return NextResponse.json({
      shareToken: review.shareToken,
      sharedAt: review.sharedAt,
    });
  }

  const shareToken = generateShareToken();
  const updated = await prisma.review.update({
    where: { id },
    data: { shareToken, sharedAt: new Date() },
  });

  return NextResponse.json(
    { shareToken: updated.shareToken, sharedAt: updated.sharedAt },
    { status: 201 },
  );
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/reviews/[id]/share">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review || review.userId !== session.user.id) {
    return NextResponse.json(
      { error: "レビューが見つかりません" },
      { status: 404 },
    );
  }

  await prisma.review.update({
    where: { id },
    data: { shareToken: null, sharedAt: null },
  });

  return new NextResponse(null, { status: 204 });
}
