import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown } from "@/components/markdown";
import { TONES, TONE_TEXT, TONE_LABEL, countByTone } from "@/lib/evaluation-tone";
import { INPUT_TYPE_LABEL } from "@/lib/evaluation-input-type";
import { resolveEvaluationSummary } from "@/lib/evaluation-summary";
import { decryptField } from "@/lib/field-crypto";

// ログイン不要の読み取り専用公開ページ。shareTokenが一致する評価のみを
// 表示し、userIdでの所有者チェックは行わない(トークン自体が公開用の鍵)。
export default async function SharedEvaluationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const evaluation = await prisma.evaluation.findUnique({
    where: { shareToken: token },
    include: {
      execution: true,
      findings: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!evaluation) {
    notFound();
  }

  const summary = resolveEvaluationSummary(evaluation);

  const counts = countByTone(evaluation.findings);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold">
          ai-forge
        </Link>
        <span className="rounded bg-accent/10 px-2 py-1 text-xs text-accent">
          公開共有ページ(読み取り専用)
        </span>
      </div>

      <h1 className="mb-4 text-xl font-semibold">{evaluation.title}</h1>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span>入力形式: {INPUT_TYPE_LABEL[evaluation.inputType]}</span>
        <span>実行: {evaluation.createdAt.toLocaleString("ja-JP")}</span>
        {evaluation.execution && <span>{evaluation.execution.model}</span>}
        <span className="flex gap-3">
          {TONES.map((t) => (
            <span key={t} className={TONE_TEXT[t]}>
              {TONE_LABEL[t]} {counts[t]}
            </span>
          ))}
        </span>
      </div>

      {summary && (
        <div className="mb-6 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <p className="mb-1 text-xs font-medium text-zinc-500">総評</p>
          <Markdown>{summary}</Markdown>
        </div>
      )}

      {evaluation.findings.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          コメントはありませんでした
        </p>
      )}

      {evaluation.findings.length > 0 && (
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
                <Markdown>{decryptField(f.body)}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-xs text-zinc-400">
        <Link href="/" className="hover:underline">
          ai-forge
        </Link>
        で作成されたAI評価結果です
      </p>
    </div>
  );
}
