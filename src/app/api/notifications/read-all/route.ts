import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ドロップダウンの「すべて既読にする」用。対象は自分の通知のみなので
// updateManyのwhereでuserIdを指定するだけでよく、所有権の個別確認は不要。
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  await prisma.notification.updateMany({
    where: { userId: session.user.id, read: false },
    data: { read: true },
  });

  return new NextResponse(null, { status: 204 });
}
