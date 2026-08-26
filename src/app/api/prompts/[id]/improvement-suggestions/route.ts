import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { DEFAULT_MODEL } from "@/lib/models";
import { PromptImprovementOutputSchema } from "@/lib/prompt-improvement-schema";
import {
  checkImprovementSuggestionRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { logError } from "@/lib/error-log";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const COMMENT_LIMIT = 50;

// 過去のレビュー指摘を分析してプロンプトの改善案を都度生成するだけの機能のため、
// runAiExecution()は使わずAnthropic APIを直接呼び出す(Executionを作らない)。
// 理由: (1) /prompts/:idの「実行履歴」タブに、プロンプト本文を実行したわけではない
// メタ分析結果が紛れ込むと紛らわしい、(2) POST /api/executions/backfill-embeddings は
// review:null のSUCCESS Executionを無差別に埋め込み対象にするため、放置すると
// メタ分析結果がRAG検索の対象として紛れ込む。詳細はdocs/phases/phase4-design.md参照。
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/prompts/[id]/improvement-suggestions">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await ctx.params;
  const prompt = await prisma.prompt.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
  const latestVersion = prompt?.versions[0];
  if (!prompt || prompt.userId !== userId || !latestVersion) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  const comments = await prisma.reviewComment.findMany({
    where: { review: { status: "SUCCESS", promptVersion: { promptId: id } } },
    orderBy: { createdAt: "desc" },
    take: COMMENT_LIMIT,
    select: { filePath: true, line: true, severity: true, body: true },
  });

  if (comments.length === 0) {
    return NextResponse.json(
      { error: "このプロンプトはまだAIレビューで使われていません" },
      { status: 400 },
    );
  }

  const rateLimit = await checkImprovementSuggestionRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const commentList = comments
    .map((c, i) => {
      const location = c.line ? `${c.filePath}:${c.line}` : c.filePath;
      return `${i + 1}. [${c.severity}] ${location} — ${c.body}`;
    })
    .join("\n");

  const metaPrompt = `あなたはプロンプトエンジニアリングの専門家です。以下は、あるAIコードレビュー用プロンプトと、そのプロンプトを使ったレビューで過去に指摘された内容の一覧です。

指摘の中から繰り返し発生しているパターンを見つけ、同じ指摘が今後減るようにプロンプト本文をどう書き換えるべきか、具体的な改善案を提案してください。

[プロンプト本文]
${latestVersion.content}

[過去のレビュー指摘(新しい順、最大${COMMENT_LIMIT}件)]
${commentList}`;

  try {
    const response = await anthropic.messages.parse({
      model: DEFAULT_MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content: metaPrompt }],
      output_config: { format: zodOutputFormat(PromptImprovementOutputSchema) },
    });

    if (!response.parsed_output) {
      throw new Error("構造化出力の解析に失敗しました");
    }

    return NextResponse.json(
      { ...response.parsed_output, commentCount: comments.length },
      { status: 200 },
    );
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `プロンプト改善提案の生成に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/prompts/${id}/improvement-suggestions`,
      userId,
    });
    return NextResponse.json(
      { error: "改善案の生成に失敗しました" },
      { status: 502 },
    );
  }
}
