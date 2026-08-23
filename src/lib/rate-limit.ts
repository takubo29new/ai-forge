import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EXECUTIONS_PER_WINDOW = 20;

// プロンプト実行・AIレビューはいずれも「AI呼び出し」であるため、共通の
// カウンタで一律に制限する。固定ウィンドウ(1時間単位)でRateLimitBucketの
// countをupsertでインクリメントする。このupsertはPostgres側でアトミックに
// 実行される(INSERT ... ON CONFLICT DO UPDATE)ため、同時リクエスト間で
// 「件数を数える→呼び出しを記録する」の間に別リクエストが割り込むような
// TOCTOUレースが起きない。失敗した実行(FAILED)も枠を消費する(再試行を
// 際限なく許すと簡単に抜け道になるため、fail-closedにしている)。
export async function checkExecutionRateLimit(userId: string) {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { userId_windowStart: { userId, windowStart } },
    create: { userId, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  return {
    allowed: bucket.count <= MAX_EXECUTIONS_PER_WINDOW,
    limit: MAX_EXECUTIONS_PER_WINDOW,
  };
}

export function rateLimitResponse(limit: number) {
  return NextResponse.json(
    {
      error: `実行回数の上限(1時間あたり${limit}回)に達しました。しばらくしてから再度お試しください。`,
    },
    { status: 429 },
  );
}
