import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { DEFAULT_MODEL } from "@/lib/models";
import { embedQuery } from "@/lib/voyage";
import { searchDocumentChunks, searchReviewComments } from "@/lib/embeddings";
import { buildChatContext, renderContextForPrompt } from "@/lib/chat-context";
import { checkChatRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { voyageErrorResponse } from "@/lib/voyage-error-response";
import { logError } from "@/lib/error-log";

const SEARCH_LIMIT_PER_SOURCE = 5;
const CONTEXT_LIMIT = 5;

// RAG検索チャットの回答生成。ユーザーが登録したプロンプト資産(PromptVersion)を
// 使う実行ではなくシステム側で組み立てるプロンプトのため、Phase 1・2のExecutionの
// 枠組み(promptVersionId必須)には乗せず、ここで直接Claudeを呼び出す
// (docs/phase3-design.md参照)。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "質問を入力してください" }, { status: 400 });
  }

  const rateLimit = await checkChatRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(question);
  } catch (error) {
    return voyageErrorResponse(error, { path: "/api/chat", userId });
  }

  const [docHits, reviewHits] = await Promise.all([
    searchDocumentChunks(userId, queryEmbedding, SEARCH_LIMIT_PER_SOURCE),
    searchReviewComments(userId, queryEmbedding, SEARCH_LIMIT_PER_SOURCE),
  ]);

  const contextEntries = buildChatContext([...docHits, ...reviewHits], CONTEXT_LIMIT);

  if (contextEntries.length === 0) {
    return NextResponse.json({
      answer:
        "関連するドキュメント・レビュー指摘が見つかりませんでした。「ドキュメント」ページで登録するか、AIレビューを実行してから質問してください。",
      sources: [],
    });
  }

  const prompt = [
    "以下の文脈だけを根拠に、質問に日本語で簡潔に回答してください。",
    "文脈に無い内容については、憶測で答えず「分かりません」と答えてください。",
    "回答の中で参照した箇所には[出典N]の形式で出典番号を付けてください。",
    "",
    "# 文脈",
    renderContextForPrompt(contextEntries),
    "",
    "# 質問",
    question,
  ].join("\n");

  let answer = "";
  try {
    const message = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    for (const block of message.content) {
      if (block.type === "text") {
        answer += block.text;
      }
    }
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `Claude呼び出しに失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/chat",
      userId,
    });
    return NextResponse.json(
      { error: "回答の生成に失敗しました。もう一度お試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    answer,
    sources: contextEntries.map((entry) => ({
      index: entry.index,
      ...entry.source,
    })),
  });
}
