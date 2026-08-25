import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { TONES, TONE_TEXT, TONE_LABEL, countByTone } from "@/lib/evaluation-tone";
import { EvaluationOutputSchema } from "@/lib/evaluation-schema";

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

  // 総評(summary)はEvaluationFindingのような専用カラムを持たないため、
  // Execution.resultText(構造化出力全体をJSON.stringifyしたもの)から都度取り出す。
  let summary: string | null = null;
  if (evaluation.status === "SUCCESS" && evaluation.execution?.resultText) {
    try {
      const parsed = EvaluationOutputSchema.safeParse(
        JSON.parse(evaluation.execution.resultText),
      );
      if (parsed.success) {
        summary = parsed.data.summary;
      }
    } catch {
      // resultTextが想定外の形式でも詳細画面自体は表示する(総評のみ省略し、
      // 下のコメント一覧はEvaluationFindingから通常どおり表示する)。
    }
  }

  const counts = countByTone(evaluation.findings);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/evaluations"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 評価一覧へ戻る
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">{evaluation.title}</h1>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span>status: {evaluation.status}</span>
        <span>実行: {evaluation.createdAt.toLocaleString("ja-JP")}</span>
        {evaluation.execution && <span>{evaluation.execution.model}</span>}
        {evaluation.status === "SUCCESS" && (
          <span className="flex gap-3">
            {TONES.map((t) => (
              <span key={t} className={TONE_TEXT[t]}>
                {TONE_LABEL[t]} {counts[t]}
              </span>
            ))}
          </span>
        )}
      </div>

      {evaluation.status === "PENDING" && (
        <p className="rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800">
          処理中です。しばらくしてから再度確認してください。
        </p>
      )}

      {evaluation.status === "FAILED" && (
        <p className="rounded-lg border border-red-200 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:text-red-400">
          {evaluation.execution?.errorMessage ?? "評価の実行に失敗しました"}
        </p>
      )}

      {evaluation.status === "SUCCESS" && summary && (
        <div className="mb-6 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium text-zinc-500">総評</p>
          <Markdown>{summary}</Markdown>
        </div>
      )}

      {evaluation.status === "SUCCESS" && evaluation.findings.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          コメントはありませんでした
        </p>
      )}

      {evaluation.status === "SUCCESS" && evaluation.findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {evaluation.findings.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <p className="text-sm font-medium">
                {f.label}{" "}
                <span className={`text-xs ${TONE_TEXT[f.tone]}`}>
                  [{TONE_LABEL[f.tone]}]
                </span>
                {f.score !== null && (
                  <span className="ml-2 text-xs text-zinc-500">{f.score}/100</span>
                )}
              </p>
              <div className="mt-1">
                <Markdown>{f.body}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
