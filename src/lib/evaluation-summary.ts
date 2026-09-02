import { decryptFieldSafe } from "@/lib/field-crypto";
import { EvaluationOutputSchema } from "@/lib/evaluation-schema";

// Evaluation.summary列を追加する前に作成された評価にはこの列の値が無いため、
// その場合のみExecution.resultText(旧仕様では構造化出力全体をJSON.stringifyして
// いた)からの再構築にフォールバックする。それ以降に作成された評価は
// Evaluation.summaryを復号するだけでよい(Execution.resultTextは平文の
// プレースホルダーに置き換わっており、総評の再構築には使えない)。
export function resolveEvaluationSummary(evaluation: {
  summary: string | null;
  execution: { resultText: string | null } | null;
}): string | null {
  if (evaluation.summary) {
    return decryptFieldSafe(evaluation.summary);
  }
  if (!evaluation.execution?.resultText) return null;
  try {
    const parsed = EvaluationOutputSchema.safeParse(
      JSON.parse(evaluation.execution.resultText),
    );
    return parsed.success ? parsed.data.summary : null;
  } catch {
    return null;
  }
}
