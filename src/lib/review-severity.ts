import type { ReviewCommentSeverity } from "@/generated/prisma/client";

export const SEVERITIES: ReviewCommentSeverity[] = ["CRITICAL", "WARNING", "INFO"];

export const SEVERITY_TEXT: Record<ReviewCommentSeverity, string> = {
  CRITICAL: "text-red-600 dark:text-red-400",
  WARNING: "text-amber-600 dark:text-amber-400",
  INFO: "text-zinc-500",
};

export const SEVERITY_BG: Record<ReviewCommentSeverity, string> = {
  CRITICAL: "bg-red-500",
  WARNING: "bg-amber-500",
  INFO: "bg-zinc-400 dark:bg-zinc-600",
};

export function countBySeverity(
  comments: { severity: ReviewCommentSeverity }[],
): Record<ReviewCommentSeverity, number> {
  const counts: Record<ReviewCommentSeverity, number> = {
    CRITICAL: 0,
    WARNING: 0,
    INFO: 0,
  };
  for (const c of comments) {
    counts[c.severity] += 1;
  }
  return counts;
}
