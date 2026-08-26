import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EXECUTIONS_PER_WINDOW = 20;
const MAX_CLIENT_ERRORS_PER_WINDOW = 30;
const MAX_DOCUMENTS_PER_WINDOW = 20;
const MAX_CHAT_MESSAGES_PER_WINDOW = 30;
const MAX_EVALUATIONS_PER_WINDOW = 20;
const MAX_IMPROVEMENT_SUGGESTIONS_PER_WINDOW = 10;

// 用途(purpose)ごとに独立したカウンタを持たせる。固定ウィンドウ(1時間単位)で
// RateLimitBucketのcountをupsertでインクリメントする。このupsertはPostgres側で
// アトミックに実行される(INSERT ... ON CONFLICT DO UPDATE)ため、同時リクエスト
// 間で「件数を数える→呼び出しを記録する」の間に別リクエストが割り込むような
// TOCTOUレースが起きない。
async function checkRateLimit(
  userId: string,
  purpose: string,
  limit: number,
) {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { userId_windowStart_purpose: { userId, windowStart, purpose } },
    create: { userId, windowStart, purpose, count: 1 },
    update: { count: { increment: 1 } },
  });

  return { allowed: bucket.count <= limit, limit };
}

// プロンプト実行・AIレビューはいずれも「AI呼び出し」であるため、共通の
// カウンタで一律に制限する。失敗した実行(FAILED)も枠を消費する(再試行を
// 際限なく許すと簡単に抜け道になるため、fail-closedにしている)。
export function checkExecutionRateLimit(userId: string) {
  return checkRateLimit(userId, "execution", MAX_EXECUTIONS_PER_WINDOW);
}

// クライアント側エラー報告(POST /api/client-errors)用の別カウンタ。
// AI呼び出しの上限(execution)とは無関係に、想定外エラーが連続発生した
// クライアントからの書き込みが無制限に積み上がらないようにする。
export function checkClientErrorRateLimit(userId: string) {
  return checkRateLimit(userId, "client-error", MAX_CLIENT_ERRORS_PER_WINDOW);
}

// ドキュメント登録(Voyage AIへの埋め込み生成を伴う)用の別カウンタ。
export function checkDocumentRateLimit(userId: string) {
  return checkRateLimit(userId, "document", MAX_DOCUMENTS_PER_WINDOW);
}

// RAG検索チャット用の別カウンタ。対話的に使う想定のため他より上限を高めにする。
export function checkChatRateLimit(userId: string) {
  return checkRateLimit(userId, "chat", MAX_CHAT_MESSAGES_PER_WINDOW);
}

// AI評価(画像評価等)用の別カウンタ。画像はテキストよりトークン消費が大きい
// ため実行系(execution)とは別に数える。実行系と同程度の規模(1時間20回)にする。
export function checkEvaluationRateLimit(userId: string) {
  return checkRateLimit(userId, "evaluation", MAX_EVALUATIONS_PER_WINDOW);
}

// プロンプト改善提案(過去のレビュー指摘を最大50件含むメタプロンプトになり
// 1回あたりのトークン消費が大きい)用の別カウンタ。実行系より低めの上限にする。
export function checkImprovementSuggestionRateLimit(userId: string) {
  return checkRateLimit(
    userId,
    "improvement-suggestion",
    MAX_IMPROVEMENT_SUGGESTIONS_PER_WINDOW,
  );
}

export function rateLimitResponse(limit: number, message?: string) {
  return NextResponse.json(
    {
      error:
        message ??
        `実行回数の上限(1時間あたり${limit}回)に達しました。しばらくしてから再度お試しください。`,
    },
    { status: 429 },
  );
}
