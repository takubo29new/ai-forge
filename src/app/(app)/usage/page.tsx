import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { estimateCostUsd, formatUsd } from "@/lib/model-pricing";

const RECENT_DAYS = 14;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function UsagePage() {
  const userId = await requireUserId();

  const since = new Date();
  since.setDate(since.getDate() - (RECENT_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [executionAgg, executionsByModel, recentExecutions, embeddingCounts] =
    await Promise.all([
      prisma.execution.aggregate({
        where: { userId },
        _sum: { promptTokens: true, completionTokens: true },
        _count: { _all: true },
      }),
      prisma.execution.groupBy({
        by: ["model"],
        where: { userId },
        _sum: { promptTokens: true, completionTokens: true },
        _count: { _all: true },
        orderBy: { model: "asc" },
      }),
      prisma.execution.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { createdAt: true, promptTokens: true, completionTokens: true },
      }),
      Promise.all([
        prisma.documentChunk.count({ where: { document: { userId } } }),
        prisma.reviewCommentEmbedding.count({
          where: { reviewComment: { review: { userId } } },
        }),
        prisma.promptVersionEmbedding.count({
          where: { promptVersion: { prompt: { userId } } },
        }),
        prisma.executionEmbedding.count({ where: { execution: { userId } } }),
      ]),
    ]);

  const [documentChunkCount, reviewCommentEmbeddingCount, promptVersionEmbeddingCount, executionEmbeddingCount] =
    embeddingCounts;
  const totalEmbeddingCount =
    documentChunkCount +
    reviewCommentEmbeddingCount +
    promptVersionEmbeddingCount +
    executionEmbeddingCount;

  // 直近RECENT_DAYS日分を日付ごとに集計し、実行が無かった日も0件として埋める
  // (棒グラフで「何もしなかった日」を空白ではなくゼロとして表現するため)。
  const dailyTotals = new Map<string, number>();
  for (let i = 0; i < RECENT_DAYS; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    dailyTotals.set(dateKey(d), 0);
  }
  for (const e of recentExecutions) {
    const key = dateKey(e.createdAt);
    const tokens = (e.promptTokens ?? 0) + (e.completionTokens ?? 0);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + tokens);
  }
  const dailyRows = [...dailyTotals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxDailyTokens = Math.max(...dailyRows.map(([, tokens]) => tokens), 0);

  const totalPromptTokens = executionAgg._sum.promptTokens ?? 0;
  const totalCompletionTokens = executionAgg._sum.completionTokens ?? 0;

  // モデルごとの概算コストを計算する。料金テーブルに無いモデル(過去に使われて
  // いたが現在は選択肢に無いもの等)はnullになるため、合計から除外しつつ
  // 「一部含まれていない」旨をUIで明示する。
  const costByModel = executionsByModel.map((row) => ({
    model: row.model,
    cost: estimateCostUsd(
      row.model,
      row._sum.promptTokens ?? 0,
      row._sum.completionTokens ?? 0,
    ),
  }));
  const totalCostUsd = costByModel.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const hasUnpricedModel = costByModel.some((r) => r.cost === null);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <h1 className="mt-2 mb-2 text-xl font-semibold">利用状況</h1>
      <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
        Claude(Anthropic)のトークン使用量とVoyage
        AIの埋め込み件数を確認できます。金額はAnthropic公式の現行料金表(2026-06-24時点)からの概算です。プロンプトキャッシュ・バッチAPI等の割引は考慮していないため、実際の請求額とは一致しません。Voyage
        AIの埋め込みコストは含まれません(トークン数を記録していないため)。
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Claude(Anthropic)— トークン使用量
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          プロンプト実行・AIレビュー・AI評価(いずれも`Execution`として記録される呼び出し)のみが対象です。RAG検索チャットの回答生成・チャットからのアクション解析・プロンプト改善提案は現状トークン数を記録していないため含まれません。
        </p>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-2xl font-semibold">{executionAgg._count._all}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">実行回数(成功+失敗)</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-2xl font-semibold">
              {totalPromptTokens.toLocaleString("ja-JP")}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">入力トークン合計</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-2xl font-semibold">
              {totalCompletionTokens.toLocaleString("ja-JP")}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">出力トークン合計</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-2xl font-semibold">{formatUsd(totalCostUsd)}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              概算コスト{hasUnpricedModel ? "(一部モデル未反映)" : ""}
            </p>
          </div>
        </div>

        {executionsByModel.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">モデル別内訳</p>
            <ul className="flex flex-col gap-1">
              {executionsByModel.map((row) => {
                const cost = costByModel.find((c) => c.model === row.model)?.cost ?? null;
                return (
                  <li
                    key={row.model}
                    className="flex items-center justify-between gap-3 border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800/60"
                  >
                    <span className="font-mono text-xs">{row.model}</span>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {row._count._all}回 ・ 入力{" "}
                      {(row._sum.promptTokens ?? 0).toLocaleString("ja-JP")} / 出力{" "}
                      {(row._sum.completionTokens ?? 0).toLocaleString("ja-JP")}
                      {" ・ "}
                      {cost === null ? "料金情報なし" : formatUsd(cost)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            直近{RECENT_DAYS}日のトークン使用量(入力+出力)
          </p>
          {maxDailyTokens === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">直近{RECENT_DAYS}日の実行はありません</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {dailyRows.map(([date, tokens]) => (
                <li
                  key={date}
                  className="relative flex items-center justify-between gap-3 overflow-hidden rounded px-2 py-1 text-xs"
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-accent/10"
                    style={{
                      width: `${maxDailyTokens > 0 ? (tokens / maxDailyTokens) * 100 : 0}%`,
                    }}
                  />
                  <span className="relative text-zinc-500 dark:text-zinc-400">{date}</span>
                  <span className="relative shrink-0">
                    {tokens.toLocaleString("ja-JP")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Voyage AI — 埋め込み件数
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          埋め込み1回あたりのトークン数は記録していないため件数のみを表示します(1件のAPI呼び出しで複数件をまとめて埋め込むことがあるため、件数=API呼び出し回数でもありません)。
        </p>

        <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-2xl font-semibold">
            {totalEmbeddingCount.toLocaleString("ja-JP")}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">埋め込み済みの件数(合計)</p>
        </div>

        <ul className="flex flex-col gap-1">
          <li className="flex items-center justify-between border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800/60">
            <span>ドキュメントチャンク</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{documentChunkCount}件</span>
          </li>
          <li className="flex items-center justify-between border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800/60">
            <span>レビュー指摘</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {reviewCommentEmbeddingCount}件
            </span>
          </li>
          <li className="flex items-center justify-between border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800/60">
            <span>プロンプトバージョン</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {promptVersionEmbeddingCount}件
            </span>
          </li>
          <li className="flex items-center justify-between py-1.5 text-sm">
            <span>実行結果</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{executionEmbeddingCount}件</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
