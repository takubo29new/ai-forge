import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// 通知を1件既読にする(ドロップダウンで項目をクリックしたとき)。
export async function PATCH(
  _request: Request,
  ctx: RouteContext<"/api/notifications/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== session.user.id) {
    return NextResponse.json(
      { error: "通知が見つかりません" },
      { status: 404 },
    );
  }

  await prisma.notification.update({ where: { id }, data: { read: true } });

  return new NextResponse(null, { status: 204 });
}
