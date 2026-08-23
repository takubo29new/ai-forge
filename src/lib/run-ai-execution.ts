import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { Execution, Prisma } from "@/generated/prisma/client";

type CallResult<T> = {
  resultText: string;
  promptTokens: number;
  completionTokens: number;
  result: T;
};

type RunAiExecutionParams<T> = {
  promptVersionId: string;
  userId: string;
  model: string;
  variables: Prisma.InputJsonValue;
  call: () => Promise<CallResult<T>>;
};

export type RunAiExecutionOutcome<T> =
  | { status: "SUCCESS"; execution: Execution; result: T }
  | { status: "FAILED"; execution: Execution; errorMessage: string };

// プロンプト実行・AIレビューの両方で共通する「Claudeを呼び出し、成否をExecutionとして
// 記録する」パターンを一箇所に集約する。呼び出し元は`call`でAPI呼び出しそのものだけを渡し、
// Execution作成(成功/失敗どちらのケースも)はここに任せる。
export async function runAiExecution<T>({
  promptVersionId,
  userId,
  model,
  variables,
  call,
}: RunAiExecutionParams<T>): Promise<RunAiExecutionOutcome<T>> {
  const startedAt = Date.now();

  try {
    const { resultText, promptTokens, completionTokens, result } =
      await call();
    const durationMs = Date.now() - startedAt;

    const execution = await prisma.execution.create({
      data: {
        promptVersionId,
        userId,
        model,
        variables,
        resultText,
        status: "SUCCESS",
        promptTokens,
        completionTokens,
        durationMs,
      },
    });

    return { status: "SUCCESS", execution, result };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMessage =
      error instanceof Anthropic.APIError
        ? `${error.status ?? ""} ${error.message}`.trim()
        : error instanceof Error
          ? error.message
          : "実行中にエラーが発生しました";

    const execution = await prisma.execution.create({
      data: {
        promptVersionId,
        userId,
        model,
        variables,
        status: "FAILED",
        errorMessage,
        durationMs,
      },
    });

    return { status: "FAILED", execution, errorMessage };
  }
}
