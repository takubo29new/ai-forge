import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { DEFAULT_MODEL } from "@/lib/models";
import { EvaluationOutputSchema } from "@/lib/evaluation-schema";
import { checkEvaluationRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { runAiExecution } from "@/lib/run-ai-execution";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Claude Vision(base64画像入力)が対応する画像形式。それ以外は事前に弾く。
const ALLOWED_IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type ImageMediaType = (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number];

function isImageMediaType(value: string): value is ImageMediaType {
  return (ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

// クライアント側(evaluation-manager.tsxのMAX_IMAGE_BYTES)と同じ5MB上限を
// サーバー側でも検証する。base64は3バイトを4文字にエンコードするため、
// 上限バイト数から最大文字数を逆算する。
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { findings: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return NextResponse.json(evaluations);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const promptId = typeof body.promptId === "string" ? body.promptId : null;
  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64 : null;
  const imageMediaType =
    typeof body.imageMediaType === "string" ? body.imageMediaType : null;

  if (!title || !promptId || !imageBase64 || !imageMediaType) {
    return NextResponse.json(
      { error: "タイトル・プロンプト・画像を指定してください" },
      { status: 400 },
    );
  }
  if (!isImageMediaType(imageMediaType)) {
    return NextResponse.json(
      { error: "対応していない画像形式です(jpeg/png/gif/webpのみ)" },
      { status: 400 },
    );
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "画像サイズが大きすぎます(5MB以下にしてください)" },
      { status: 400 },
    );
  }

  const promptVersion = await prisma.promptVersion.findFirst({
    where: { prompt: { id: promptId, userId } },
    orderBy: { versionNumber: "desc" },
  });
  if (!promptVersion) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 400 },
    );
  }

  const rateLimit = await checkEvaluationRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const outcome = await runAiExecution({
    promptVersionId: promptVersion.id,
    userId,
    model: DEFAULT_MODEL,
    // 画像評価に{{変数名}}展開は使わないため空のまま記録する
    // (プロンプト実行・AIレビューと同じExecution.variablesカラムを流用するための形合わせ)。
    variables: {},
    call: async () => {
      const response = await anthropic.messages.parse({
        model: DEFAULT_MODEL,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageMediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: promptVersion.content },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(EvaluationOutputSchema) },
      });

      if (!response.parsed_output) {
        throw new Error("構造化出力の解析に失敗しました");
      }

      return {
        resultText: JSON.stringify(response.parsed_output),
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        result: response.parsed_output,
      };
    },
  });

  if (outcome.status === "SUCCESS") {
    const { findings } = outcome.result;

    const evaluation = await prisma.$transaction(async (tx) => {
      const created = await tx.evaluation.create({
        data: {
          userId,
          promptVersionId: promptVersion.id,
          executionId: outcome.execution.id,
          inputType: "IMAGE",
          title,
          status: "SUCCESS",
        },
      });

      if (findings.length > 0) {
        await tx.evaluationFinding.createMany({
          data: findings.map((f) => ({
            evaluationId: created.id,
            label: f.label,
            tone: f.tone,
            score: f.score,
            body: f.body,
          })),
        });
      }

      return created;
    });

    return NextResponse.json({ id: evaluation.id }, { status: 201 });
  }

  const evaluation = await prisma.evaluation.create({
    data: {
      userId,
      promptVersionId: promptVersion.id,
      executionId: outcome.execution.id,
      inputType: "IMAGE",
      title,
      status: "FAILED",
    },
  });

  return NextResponse.json({ id: evaluation.id }, { status: 200 });
}
