import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";
import { INPUT_TYPE_LABEL, INPUT_TYPE_ICON } from "@/lib/evaluation-input-type";
import { resolveEvaluationSummary } from "@/lib/evaluation-summary";
import { decryptFieldSafe } from "@/lib/field-crypto";
import { EvaluationBatchGrid } from "@/components/evaluation-batch-grid";
import { BatchPendingRefresher } from "./pending-refresher";

// バッチAI評価(Issue #108)。バッチに属するEvaluationを一覧し、まだPENDINGが
// 残っていれば進捗を、全件が終端状態(SUCCESS/FAILED)に達していればN件の
// 結果グリッドを表示する。
export default async function EvaluationBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const userId = await requireUserId();
  const { batchId } = await params;

  const batch = await prisma.evaluationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.userId !== userId) {
    notFound();
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { batchId },
    include: { execution: true, findings: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  // 「完了したか」はEvaluation行の有無(stillPending)ではなく、権威ある
  // completedCount/totalで判定する。クライアントはBATCH_CONCURRENCY件ずつ
  // 逐次送信するため、まだ送信していない項目がある段階でこの画面を開くと
  // (履歴一覧の「バッチの一部」バッジ等から)、その時点でDBに存在するのは
  // 一部だけでPENDING行も無い、という状態がありうる。その場合をstillPending
  // だけで判定すると「まだ送信されていない分」を「弾かれて除外された分」と
  // 誤認して表示してしまう。
  const finished = batch.completedCount >= batch.total;
  const stillPending = !finished || evaluations.some((e) => e.status === "PENDING");
  // バリデーション/レート制限/クライアント側の送信失敗で弾かれた項目は
  // Evaluation行自体が作られないため、一覧には現れない(バッチの完了カウンタ
  // 側では終端扱い済み)。件数の食い違いだけ利用者に説明する(finished確定後のみ)。
  const missingCount = finished ? batch.total - evaluations.length : 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link
        href="/evaluations"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 評価一覧へ戻る
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">
        バッチ評価({evaluations.length}/{batch.total}件)
      </h1>

      {stillPending && (
        <>
          <p className="mb-6 flex items-start gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 dark:border-zinc-800">
            処理中です。完了すると自動的にこの画面が更新されます(離れても完了時に通知します)。
          </p>
          <BatchPendingRefresher />
        </>
      )}

      {missingCount > 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:text-amber-400">
          {missingCount}件はファイルの検証エラー・実行回数の上限・通信エラーのいずれかにより送信されず、バッチから除外されました。
        </p>
      )}

      <ul className="mb-6 flex flex-col gap-2">
        {evaluations.map((evaluation) => {
          const InputTypeIcon = INPUT_TYPE_ICON[evaluation.inputType];
          const StatusIcon = STATUS_ICON[evaluation.status];
          return (
            <li
              key={evaluation.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
            >
              <Link href={`/evaluations/${evaluation.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {evaluation.title}
              </Link>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <InputTypeIcon className="h-3.5 w-3.5" />
                {INPUT_TYPE_LABEL[evaluation.inputType]}
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${STATUS_TEXT[evaluation.status]}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {STATUS_LABEL[evaluation.status]}
              </span>
            </li>
          );
        })}
      </ul>

      {!stillPending && (
        <EvaluationBatchGrid
          evaluations={evaluations.map((evaluation) => ({
            id: evaluation.id,
            title: evaluation.title,
            status: evaluation.status === "SUCCESS" ? "SUCCESS" : "FAILED",
            summary:
              evaluation.status === "SUCCESS" ? resolveEvaluationSummary(evaluation) : null,
            findings: evaluation.findings.map((f) => ({
              id: f.id,
              label: f.label,
              tone: f.tone,
              score: f.score,
              body: decryptFieldSafe(f.body),
            })),
          }))}
        />
      )}
    </div>
  );
}
