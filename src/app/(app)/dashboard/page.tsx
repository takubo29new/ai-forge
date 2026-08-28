import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { SEVERITIES, SEVERITY_TEXT, SEVERITY_ICON } from "@/lib/review-severity";

export default async function DashboardPage() {
  const userId = await requireUserId();

  const [
    promptCount,
    repositoryCount,
    documentCount,
    documentChunkCount,
    evaluationCount,
    severityGroups,
  ] = await Promise.all([
    prisma.prompt.count({ where: { userId } }),
    prisma.repository.count({ where: { userId } }),
    prisma.document.count({ where: { userId } }),
    prisma.documentChunk.count({ where: { document: { userId } } }),
    prisma.evaluation.count({ where: { userId } }),
    prisma.reviewComment.groupBy({
      by: ["severity"],
      where: { review: { userId } },
      _count: { severity: true },
    }),
  ]);

  const severityTotals: Record<(typeof SEVERITIES)[number], number> = {
    CRITICAL: 0,
    WARNING: 0,
    INFO: 0,
  };
  for (const g of severityGroups) {
    severityTotals[g.severity] = g._count.severity;
  }
  const totalFindings = SEVERITIES.reduce((sum, s) => sum + severityTotals[s], 0);
  const isFirstTimeUser =
    promptCount === 0 && repositoryCount === 0 && documentCount === 0 && evaluationCount === 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-xl font-semibold">ダッシュボード</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        プロンプト・リポジトリ・レビュー・ドキュメントを横断したサマリです。
      </p>

      {isFirstTimeUser && (
        <div className="mb-8 rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="mb-3 text-sm font-medium">
            ようこそ。まずは以下のいずれかから始めてください
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link href="/prompts/new" className="text-accent hover:underline">
                + 最初のプロンプトを作成する
              </Link>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                プロンプトを保存し、いつでも同じ条件でAIを実行できるようにする
              </span>
            </li>
            <li>
              <Link href="/repositories" className="text-accent hover:underline">
                + リポジトリを接続する
              </Link>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                GitHubリポジトリを接続し、AIコードレビューを実行できるようにする
              </span>
            </li>
            <li>
              <Link href="/documents" className="text-accent hover:underline">
                + ドキュメントを登録する
              </Link>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                RAG検索チャットの検索対象を登録する
              </span>
            </li>
          </ul>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Link
          href="/prompts"
          className="rounded-lg border border-zinc-200 p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:border-zinc-800"
        >
          <p className="text-2xl font-semibold">{promptCount}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">プロンプト</p>
        </Link>
        <Link
          href="/repositories"
          className="rounded-lg border border-zinc-200 p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:border-zinc-800"
        >
          <p className="text-2xl font-semibold">{repositoryCount}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">接続リポジトリ</p>
        </Link>
        <Link
          href="/repositories"
          className="rounded-lg border border-zinc-200 p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:border-zinc-800"
        >
          <p className="text-2xl font-semibold">{totalFindings}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">累計レビュー指摘</p>
        </Link>
        <Link
          href="/documents"
          className="rounded-lg border border-zinc-200 p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:border-zinc-800"
        >
          <p className="text-2xl font-semibold">{documentCount}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            登録ドキュメント({documentChunkCount}チャンク)
          </p>
        </Link>
        <Link
          href="/evaluations"
          className="rounded-lg border border-zinc-200 p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md dark:border-zinc-800"
        >
          <p className="text-2xl font-semibold">{evaluationCount}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">AI評価</p>
        </Link>
      </div>

      {totalFindings > 0 && (
        <div className="mb-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            レビュー指摘の重要度内訳
          </p>
          <div className="flex gap-6">
            {SEVERITIES.map((s) => {
              const SevIcon = SEVERITY_ICON[s];
              return (
                <div key={s}>
                  <p className={`text-lg font-semibold ${SEVERITY_TEXT[s]}`}>
                    {severityTotals[s]}
                  </p>
                  <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <SevIcon className="h-3.5 w-3.5" />
                    {s}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/chat"
          className="rounded bg-accent transition-opacity hover:opacity-90 px-4 py-2 text-sm font-medium text-white"
        >
          チャットで質問する
        </Link>
        <Link
          href="/documents"
          className="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          ドキュメントを管理
        </Link>
      </div>
    </div>
  );
}
