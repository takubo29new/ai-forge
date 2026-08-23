import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/reviews/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      repository: true,
      execution: true,
      comments: { orderBy: { filePath: "asc" } },
    },
  });

  if (!review || review.userId !== session.user.id) {
    return NextResponse.json(
      { error: "レビューが見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json(review);
}
