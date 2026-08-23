import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logError } from "@/lib/error-log";
import { checkClientErrorRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const rateLimit = await checkClientErrorRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return rateLimitResponse(
      rateLimit.limit,
      `エラー報告の送信回数の上限(1時間あたり${rateLimit.limit}回)に達しました。`,
    );
  }

  const body = await request.json().catch(() => null);
  const message =
    body && typeof body.message === "string" ? body.message : null;
  if (!message) {
    return NextResponse.json(
      { error: "messageは必須です" },
      { status: 400 },
    );
  }

  await logError({
    source: "CLIENT",
    message,
    digest: typeof body.digest === "string" ? body.digest : null,
    stack: typeof body.stack === "string" ? body.stack : null,
    path: typeof body.path === "string" ? body.path : null,
    userId: session.user.id,
  });

  return new NextResponse(null, { status: 204 });
}
