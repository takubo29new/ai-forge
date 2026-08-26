import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ヘッダーの通知センター(ドロップダウン)向けの一覧。ページネーションUIを
// 設けるほどの規模ではないため、直近の一定件数のみを返す固定上限にする
// (一覧ページのLIST_LIMITとは用途が異なるため別定数にしている)。
const NOTIFICATION_LIMIT = 20;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const userId = session.user.id;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIMIT,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
