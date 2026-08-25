import type { EvaluationTone } from "@/generated/prisma/client";

export const TONES: EvaluationTone[] = ["CONCERN", "SUGGESTION", "POSITIVE"];

export const TONE_TEXT: Record<EvaluationTone, string> = {
  CONCERN: "text-red-600 dark:text-red-400",
  SUGGESTION: "text-amber-600 dark:text-amber-400",
  POSITIVE: "text-emerald-600 dark:text-emerald-400",
};

export const TONE_BG: Record<EvaluationTone, string> = {
  CONCERN: "bg-red-500",
  SUGGESTION: "bg-amber-500",
  POSITIVE: "bg-emerald-500",
};

export const TONE_LABEL: Record<EvaluationTone, string> = {
  CONCERN: "気になる点",
  SUGGESTION: "提案",
  POSITIVE: "良い点",
};

export function countByTone(
  findings: { tone: EvaluationTone }[],
): Record<EvaluationTone, number> {
  const counts: Record<EvaluationTone, number> = {
    CONCERN: 0,
    SUGGESTION: 0,
    POSITIVE: 0,
  };
  for (const f of findings) {
    counts[f.tone] += 1;
  }
  return counts;
}
