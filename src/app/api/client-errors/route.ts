import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logError } from "@/lib/error-log";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
