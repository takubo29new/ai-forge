import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { TONE_ICON, TONE_TEXT, TONE_LABEL } from "@/lib/evaluation-tone";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";
import type { EvaluationTone } from "@/generated/prisma/client";

type GridEvaluation = {
  id: string;
  title: string;
  status: "SUCCESS" | "FAILED";
  summary: string | null;
  findings: { id: string; label: string; tone: EvaluationTone; score: number | null; body: string }[];
};

// バッチAI評価(Issue #108)の全終端結果をN件並べて表示する。既存の
// prompts/[id]/compare・repositories/[id]/compareの2件専用(?a=&b=)比較UIとは
// 別設計(N件かつ2件固定の比較機能ではないため、あえて汎用化しない)。
export function EvaluationBatchGrid({ evaluations }: { evaluations: GridEvaluation[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {evaluations.map((evaluation) => {
        const StatusIcon = STATUS_ICON[evaluation.status];
        return (
          <Link
            key={evaluation.id}
            href={`/evaluations/${evaluation.id}`}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
          >
            <p className="truncate text-sm font-medium">{evaluation.title}</p>
            <span
              className={`inline-flex w-fit items-center gap-1 text-xs ${STATUS_TEXT[evaluation.status]}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {STATUS_LABEL[evaluation.status]}
            </span>
            {evaluation.status === "SUCCESS" && evaluation.summary && (
              <div className="line-clamp-4 text-xs text-zinc-600 dark:text-zinc-400">
                <Markdown>{evaluation.summary}</Markdown>
              </div>
            )}
            {evaluation.status === "SUCCESS" && evaluation.findings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {evaluation.findings.slice(0, 3).map((f) => {
                  const FindingToneIcon = TONE_ICON[f.tone];
                  return (
                    <li
                      key={f.id}
                      className={`inline-flex items-center gap-1 text-xs ${TONE_TEXT[f.tone]}`}
                    >
                      <FindingToneIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {f.label}({TONE_LABEL[f.tone]})
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Link>
        );
      })}
    </div>
  );
}
