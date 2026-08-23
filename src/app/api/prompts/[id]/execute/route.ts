import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { renderTemplate } from "@/lib/prompt-variables";
import { DEFAULT_MODEL } from "@/lib/models";
import { checkExecutionRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runAiExecution } from "@/lib/run-ai-execution";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/prompts/[id]/execute">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const prompt = await prisma.prompt.findUnique({ where: { id } });
  if (!prompt || prompt.userId !== session.user.id) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const model =
    typeof body.model === "string" && body.model ? body.model : DEFAULT_MODEL;
  const variables: Record<string, string> =
    body.variables && typeof body.variables === "object" ? body.variables : {};

  const promptVersion =
    typeof body.promptVersionId === "string"
      ? await prisma.promptVersion.findUnique({
          where: { id: body.promptVersionId },
        })
      : await prisma.promptVersion.findFirst({
          where: { promptId: id },
          orderBy: { versionNumber: "desc" },
        });

  if (!promptVersion || promptVersion.promptId !== id) {
    return NextResponse.json(
      { error: "対象のバージョンが見つかりません" },
      { status: 400 },
    );
  }

  const rateLimit = await checkExecutionRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const renderedContent = renderTemplate(promptVersion.content, variables);

  const outcome = await runAiExecution({
    promptVersionId: promptVersion.id,
    userId: session.user.id,
    model,
    variables,
    call: async () => {
      const message = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        messages: [{ role: "user", content: renderedContent }],
      });

      let resultText = "";
      for (const block of message.content) {
        if (block.type === "text") {
          resultText += block.text;
        }
      }

      return {
        resultText,
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        result: null,
      };
    },
  });

  // 実行失敗(status: FAILED)はリクエスト自体は正常に処理できているため200を返す。
  // 201はExecutionが成功として作成された場合のみ。
  return NextResponse.json(outcome.execution, {
    status: outcome.status === "SUCCESS" ? 201 : 200,
  });
}
