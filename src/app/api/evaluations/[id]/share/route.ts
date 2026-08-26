import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/share-token";

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/evaluations/[id]/share">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const evaluation = await prisma.evaluation.findUnique({ where: { id } });
  if (!evaluation || evaluation.userId !== session.user.id) {
    return NextResponse.json(
      { error: "評価が見つかりません" },
      { status: 404 },
    );
  }

  if (evaluation.status !== "SUCCESS") {
    return NextResponse.json(
      { error: "成功した評価のみ共有できます" },
      { status: 400 },
    );
  }

  // Reviewと同様、既に共有済みなら同じトークンを返す(冪等)。
  if (evaluation.shareToken) {
    return NextResponse.json({
      shareToken: evaluation.shareToken,
      sharedAt: evaluation.sharedAt,
    });
  }

  const shareToken = generateShareToken();
  const updated = await prisma.evaluation.update({
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
  ctx: RouteContext<"/api/evaluations/[id]/share">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const evaluation = await prisma.evaluation.findUnique({ where: { id } });
  if (!evaluation || evaluation.userId !== session.user.id) {
    return NextResponse.json(
      { error: "評価が見つかりません" },
      { status: 404 },
    );
  }

  await prisma.evaluation.update({
    where: { id },
    data: { shareToken: null, sharedAt: null },
  });

  return new NextResponse(null, { status: 204 });
}
