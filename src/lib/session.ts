import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// React.cacheでリクエスト単位にメモ化する。layout・page・AppHeaderが同じ
// リクエスト内でそれぞれauth()を呼んでも、DBへのセッション照会は1回で済む
// (database session方式のためauth()はPrisma経由でSessionを読みに行く)。
export const getSession = cache(auth);

// ページ側はuserIdだけあれば十分なため、Session型を返すのではなく
// userIdを直接返す(セッション情報自体が必要な箇所はgetSession()を使う)。
export async function requireUserId() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user.id;
}
