import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { TONES, TONE_TEXT, TONE_LABEL, TONE_ICON, countByTone } from "@/lib/evaluation-tone";
import { PendingRefresher } from "./pending-refresher";
import { ShareControl } from "@/components/share-control";
import { INPUT_TYPE_LABEL, INPUT_TYPE_ICON } from "@/lib/evaluation-input-type";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";
import { resolveEvaluationSummary } from "@/lib/evaluation-summary";
import { decryptField } from "@/lib/field-crypto";

export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      execution: true,
      findings: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!evaluation || evaluation.userId !== userId) {
    notFound();
  }

  const summary =
    evaluation.status === "SUCCESS" ? resolveEvaluationSummary(evaluation) : null;

  const counts = countByTone(evaluation.findings);
  const InputTypeIcon = INPUT_TYPE_ICON[evaluation.inputType];
  const StatusIcon = STATUS_ICON[evaluation.status];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/evaluations"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 評価一覧へ戻る
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">{evaluation.title}</h1>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <InputTypeIcon className="h-4 w-4" />
          {INPUT_TYPE_LABEL[evaluation.inputType]}
        </span>
        <span className={`inline-flex items-center gap-1 ${STATUS_TEXT[evaluation.status]}`}>
          <StatusIcon className="h-4 w-4" />
          {STATUS_LABEL[evaluation.status]}
        </span>
        <span>実行: {evaluation.createdAt.toLocaleString("ja-JP")}</span>
        {evaluation.execution && <span>{evaluation.execution.model}</span>}
        {evaluation.status === "SUCCESS" && (
          <span className="flex gap-3">
            {TONES.map((t) => {
              const ToneIcon = TONE_ICON[t];
              return (
                <span key={t} className={`inline-flex items-center gap-1 ${TONE_TEXT[t]}`}>
                  <ToneIcon className="h-4 w-4" />
                  {TONE_LABEL[t]} {counts[t]}
                </span>
              );
            })}
          </span>
        )}
      </div>

      {evaluation.status === "SUCCESS" && (
        <div className="mb-6">
          <ShareControl
            kind="evaluations"
            id={evaluation.id}
            initialShareToken={evaluation.shareToken}
          />
        </div>
      )}

      {evaluation.status === "PENDING" && (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 dark:border-zinc-800">
            <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
            処理中です。完了すると自動的にこの画面が更新されます(離れても完了時に通知します)。
          </p>
          <PendingRefresher />
        </>
      )}

      {evaluation.status === "FAILED" && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:text-red-400">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {evaluation.execution?.errorMessage ?? "評価の実行に失敗しました"}
        </p>
      )}

      {evaluation.status === "SUCCESS" && summary && (
        <div className="mb-6 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">総評</p>
          <Markdown>{summary}</Markdown>
        </div>
      )}

      {evaluation.status === "SUCCESS" && evaluation.findings.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          コメントはありませんでした
        </p>
      )}

      {evaluation.status === "SUCCESS" && evaluation.findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {evaluation.findings.map((f) => {
            const FindingToneIcon = TONE_ICON[f.tone];
            return (
              <li
                key={f.id}
                className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {f.label}
                  <span className={`inline-flex items-center gap-1 text-xs ${TONE_TEXT[f.tone]}`}>
                    <FindingToneIcon className="h-3.5 w-3.5" />
                    {TONE_LABEL[f.tone]}
                  </span>
                  {f.score !== null && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{f.score}/100</span>
                  )}
                </p>
                <div className="mt-1">
                  <Markdown>{decryptField(f.body)}</Markdown>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
