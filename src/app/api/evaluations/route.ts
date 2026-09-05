import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { DEFAULT_MODEL } from "@/lib/models";
import { EvaluationOutputSchema } from "@/lib/evaluation-schema";
import { checkEvaluationRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { renderTemplate } from "@/lib/prompt-variables";
import { runAiExecution } from "@/lib/run-ai-execution";
import { scheduleBackground } from "@/lib/schedule-background";
import { createEvaluationNotification } from "@/lib/notifications";
import { recordBatchItemCompleted, recordBatchItemSkipped } from "@/lib/evaluation-batch";
import { encryptField } from "@/lib/field-crypto";
import { logError } from "@/lib/error-log";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Claude Visionの呼び出しはレイテンシが大きいため、バックグラウンド実行
// (after())を使う。afterのコールバックもルート自体のmaxDurationの範囲内で
// しか実行されないため、既存のdocuments/syncルートと同じく引き上げておく。
export const maxDuration = 60;

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

// PDFはAnthropicのドキュメント入力(32MB/100ページ)よりアプリ側で小さめの
// 上限に絞る(リクエストサイズ・レート制限あたりのコストを抑えるため)。
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PDF_BYTES / 3) * 4;

// Execution.resultTextは複数の実行系(プロンプト実行・AIレビュー・AI評価)で
// 共有される列だが、AI評価の総評・観点別コメントはEvaluation.summary/
// EvaluationFinding.bodyとして暗号化して個別に保存する(下記)。resultTextに
// 同じ内容を平文で複製すると、そちらは共有列ゆえに暗号化が及ばず(実行履歴タブ・
// RAG埋め込みバックフィル等、AI評価を想定していない箇所からも読めてしまう)
// 個人情報が漏れる経路になるため、AI評価分のresultTextはプレースホルダーに留める。
const EVALUATION_RESULT_PLACEHOLDER =
  "(AI評価の結果は暗号化してEvaluationに個別保存されています。詳細は評価結果画面を参照してください)";

// 通知の作成は評価結果そのものより重要度が低い副次的な処理のため、失敗しても
// Evaluationのステータス確定には影響させないベストエフォートで行う
// (src/app/api/repositories/[id]/reviews/route.tsの埋め込み生成と同じ方針)。
async function notifyEvaluationOutcomeBestEffort(
  userId: string,
  evaluationId: string,
  title: string,
  status: "SUCCESS" | "FAILED",
) {
  try {
    await createEvaluationNotification({ userId, evaluationId, title, status });
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `評価完了の通知作成に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: "/api/evaluations",
      userId,
    });
  }
}

// バッチAI評価(Issue #108)に属する場合は個別のEvaluation単位では通知せず、
// バッチ全体の完了カウンタを進める(通知センターがバッチのファイル数分埋まる
// のを避けるため)。単独の評価はこれまでどおり1件ずつ通知する。
async function finishEvaluationBestEffort(
  userId: string,
  evaluationId: string,
  title: string,
  status: "SUCCESS" | "FAILED",
  batchId: string | null,
) {
  if (batchId) {
    await recordBatchItemCompleted(batchId);
    return;
  }
  await notifyEvaluationOutcomeBestEffort(userId, evaluationId, title, status);
}

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
  // inputTypeは"TEXT"/"PDF"を明示した場合のみそれぞれの評価、それ以外
  // (未指定含む)は既存の画像評価として扱う(後方互換)。
  const inputType =
    body.inputType === "TEXT"
      ? "TEXT"
      : body.inputType === "PDF"
        ? "PDF"
        : "IMAGE";

  // バッチAI評価(Issue #108)。TEXTは対象外(variablesベースのバッチはUI上
  // 想定していないため、指定されても無視する)。batchIdは他ユーザーのバッチを
  // 誤って/不正にカウントしないよう、所有権を確認できたものだけを以降で使う。
  const rawBatchId =
    typeof body.batchId === "string" &&
    (inputType === "IMAGE" || inputType === "PDF")
      ? body.batchId
      : null;
  let batchId: string | null = null;
  if (rawBatchId) {
    const batch = await prisma.evaluationBatch.findFirst({
      where: { id: rawBatchId, userId },
    });
    if (!batch) {
      return NextResponse.json(
        { error: "バッチが見つかりません" },
        { status: 400 },
      );
    }
    batchId = batch.id;
  }

  // バリデーションで弾かれるとEvaluation行自体が作られないため、バッチに属する
  // リクエストの場合はここで完了カウンタを進めておかないと、そのバッチが
  // いつまでもtotalに到達せずまとめ通知が送られなくなる。
  async function fail(status: number, error: string) {
    if (batchId) await recordBatchItemSkipped(batchId);
    return NextResponse.json({ error }, { status });
  }

  if (!title || !promptId) {
    return fail(400, "タイトル・プロンプトを指定してください");
  }

  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64 : null;
  const imageMediaType =
    typeof body.imageMediaType === "string" ? body.imageMediaType : null;
  const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : null;
  // テキスト評価は既存のプロンプト実行と同じ{{変数名}}展開を使う
  // (docs/phases/phase5-design.md「対応する入力形式」参照)。
  const variables: Record<string, string> = {};

  if (inputType === "IMAGE") {
    if (!imageBase64 || !imageMediaType) {
      return fail(400, "画像を指定してください");
    }
    if (!isImageMediaType(imageMediaType)) {
      return fail(400, "対応していない画像形式です(jpeg/png/gif/webpのみ)");
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return fail(400, "画像サイズが大きすぎます(5MB以下にしてください)");
    }
  } else if (inputType === "PDF") {
    if (!pdfBase64) {
      return fail(400, "PDFファイルを指定してください");
    }
    if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
      return fail(400, "PDFサイズが大きすぎます(20MB以下にしてください)");
    }
  } else {
    const rawVariables = body.variables;
    if (typeof rawVariables === "object" && rawVariables !== null) {
      for (const [key, value] of Object.entries(rawVariables)) {
        if (typeof value === "string") variables[key] = value;
      }
    }
  }

  const promptVersion = await prisma.promptVersion.findFirst({
    where: { prompt: { id: promptId, userId } },
    orderBy: { versionNumber: "desc" },
  });
  if (!promptVersion) {
    return fail(400, "プロンプトが見つかりません");
  }

  const rateLimit = await checkEvaluationRateLimit(userId);
  if (!rateLimit.allowed) {
    if (batchId) await recordBatchItemSkipped(batchId);
    return rateLimitResponse(rateLimit.limit);
  }

  // Claude Vision呼び出しはレイテンシが大きいため、先にPENDINGなEvaluationを
  // 作って即座に返し、実際のAI呼び出し・結果の書き込みはバックグラウンドで行う
  // (Phase 5「バックグラウンド処理」、docs/phases/phase5-design.md参照)。
  const evaluation = await prisma.evaluation.create({
    data: {
      userId,
      promptVersionId: promptVersion.id,
      inputType,
      title,
      status: "PENDING",
      batchId,
    },
  });

  await scheduleBackground(async () => {
    try {
      const outcome = await runAiExecution({
        promptVersionId: promptVersion.id,
        userId,
        model: DEFAULT_MODEL,
        variables,
        call: async () => {
          const content =
            inputType === "IMAGE"
              ? [
                  {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: imageMediaType!,
                      data: imageBase64!,
                    },
                  },
                  { type: "text" as const, text: promptVersion.content },
                ]
              : inputType === "PDF"
                ? [
                    {
                      type: "document" as const,
                      source: {
                        type: "base64" as const,
                        media_type: "application/pdf" as const,
                        data: pdfBase64!,
                      },
                    },
                    { type: "text" as const, text: promptVersion.content },
                  ]
                : renderTemplate(promptVersion.content, variables);

          const response = await anthropic.messages.parse(
            {
              model: DEFAULT_MODEL,
              max_tokens: 16000,
              messages: [{ role: "user", content }],
              output_config: { format: zodOutputFormat(EvaluationOutputSchema) },
            },
            // after()のコールバックもルートのmaxDuration(60秒)の範囲内でしか実行
            // されないため、Vercelに無言で強制終了される前にSDK側で打ち切り、
            // runAiExecution()のcatchでFAILEDとして記録させる
            // (Webhookレビュー: run-repository-review.tsと同じ対策、Issue #106)。
            { timeout: 50_000 },
          );

          if (!response.parsed_output) {
            throw new Error("構造化出力の解析に失敗しました");
          }

          return {
            resultText: EVALUATION_RESULT_PLACEHOLDER,
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            result: response.parsed_output,
          };
        },
      });

      if (outcome.status === "SUCCESS") {
        const { summary, findings } = outcome.result;
        await prisma.$transaction(async (tx) => {
          await tx.evaluation.update({
            where: { id: evaluation.id },
            data: {
              status: "SUCCESS",
              executionId: outcome.execution.id,
              summary: encryptField(summary),
            },
          });
          if (findings.length > 0) {
            await tx.evaluationFinding.createMany({
              data: findings.map((f) => ({
                evaluationId: evaluation.id,
                label: f.label,
                tone: f.tone,
                score: f.score,
                body: encryptField(f.body),
              })),
            });
          }
        });
        await finishEvaluationBestEffort(userId, evaluation.id, title, "SUCCESS", batchId);
        return;
      }

      await prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { status: "FAILED", executionId: outcome.execution.id },
      });
      await finishEvaluationBestEffort(userId, evaluation.id, title, "FAILED", batchId);
    } catch (error) {
      // runAiExecution自体は失敗時も例外を投げないが、その後のDB書き込みが
      // 失敗した場合にEvaluationがPENDINGのまま残り続けるのを防ぐため、
      // ここで確実にFAILEDへ倒す(ベストエフォート。これ自体が失敗しても
      // ErrorLogには記録済みなので調査はできる)。
      await logError({
        source: "SERVER",
        message: `評価のバックグラウンド実行に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
        path: "/api/evaluations",
        userId,
      });
      await prisma.evaluation
        .update({ where: { id: evaluation.id }, data: { status: "FAILED" } })
        .catch(() => {});
      await finishEvaluationBestEffort(userId, evaluation.id, title, "FAILED", batchId);
    }
  });

  return NextResponse.json({ id: evaluation.id, status: "PENDING" }, { status: 202 });
}
