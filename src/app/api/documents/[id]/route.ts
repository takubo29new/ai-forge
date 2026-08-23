import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/documents/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document || document.userId !== session.user.id) {
    return NextResponse.json(
      { error: "ドキュメントが見つかりません" },
      { status: 404 },
    );
  }

  await prisma.document.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
