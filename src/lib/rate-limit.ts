import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EXECUTIONS_PER_WINDOW = 20;

// プロンプト実行・AIレビューはいずれもExecutionを1件作成するため、
// Executionの直近作成件数を数えるだけで両方のエンドポイントを一律に制限できる。
export async function checkExecutionRateLimit(userId: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const count = await prisma.execution.count({
    where: { userId, createdAt: { gte: since } },
  });

  return {
    allowed: count < MAX_EXECUTIONS_PER_WINDOW,
    limit: MAX_EXECUTIONS_PER_WINDOW,
  };
}
