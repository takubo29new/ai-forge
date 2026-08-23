import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { getGitHubClient, listOpenPullRequests } from "@/lib/github";
import { PullRequestList } from "./pull-request-list";

const TABS = [
  { key: "pulls", label: "オープンなPR" },
  { key: "history", label: "レビュー履歴" },
  { key: "trends", label: "傾向" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: "text-red-600 dark:text-red-400",
  WARNING: "text-amber-600 dark:text-amber-400",
  INFO: "text-zinc-500",
};

const SEVERITY_BG: Record<string, string> = {
  CRITICAL: "bg-red-500",
  WARNING: "bg-amber-500",
  INFO: "bg-zinc-400 dark:bg-zinc-600",
};

const SEVERITIES = ["CRITICAL", "WARNING", "INFO"] as const;

export default async function RepositoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "pulls";

  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== userId) {
    notFound();
  }

  let pulls: Awaited<ReturnType<typeof listOpenPullRequests>> | null = null;
  let pullsError: string | null = null;
  let prompts: { id: string; title: string; usesDiff: boolean }[] = [];
  if (tab === "pulls") {
    const octokit = await getGitHubClient(userId);
    if (!octokit) {
      pullsError =
        "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。";
    } else {
      try {
        pulls = await listOpenPullRequests(
          octokit,
          repository.owner,
          repository.name,
        );
      } catch {
        pullsError = "オープンなPRの取得に失敗しました";
      }
    }
    const promptRows = await prisma.prompt.findMany({
      where: { userId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    prompts = promptRows.map((p) => ({
      id: p.id,
      title: p.title,
      usesDiff: (p.versions[0]?.content ?? "").includes("{{diff}}"),
    }));
  }

  const reviews =
    tab === "history"
      ? await prisma.review.findMany({
          where: { repositoryId: id },
          include: { _count: { select: { comments: true } } },
          orderBy: { createdAt: "desc" },
        })
      : null;

  let severityTotals: Record<string, number> | null = null;
  let topFiles: { filePath: string; count: number }[] = [];
  let trendReviews: {
    id: string;
    pullRequestNumber: number;
    pullRequestTitle: string;
    createdAt: Date;
    counts: Record<string, number>;
    total: number;
  }[] = [];

  if (tab === "trends") {
    const [severityGroups, fileGroups, recentReviews] = await Promise.all([
      prisma.reviewComment.groupBy({
        by: ["severity"],
        where: { review: { repositoryId: id } },
        _count: { severity: true },
      }),
      prisma.reviewComment.groupBy({
        by: ["filePath"],
        where: { review: { repositoryId: id } },
        _count: { filePath: true },
        orderBy: { _count: { filePath: "desc" } },
        take: 8,
      }),
      prisma.review.findMany({
        where: { repositoryId: id, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { comments: { select: { severity: true } } },
      }),
    ]);

    severityTotals = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    for (const g of severityGroups) {
      severityTotals[g.severity] = g._count.severity;
    }

    topFiles = fileGroups.map((g) => ({
      filePath: g.filePath,
      count: g._count.filePath,
    }));

    trendReviews = recentReviews.map((review) => {
      const counts: Record<string, number> = {
        CRITICAL: 0,
        WARNING: 0,
        INFO: 0,
      };
      for (const c of review.comments) {
        counts[c.severity] = (counts[c.severity] ?? 0) + 1;
      }
      return {
        id: review.id,
        pullRequestNumber: review.pullRequestNumber,
        pullRequestTitle: review.pullRequestTitle,
        createdAt: review.createdAt,
        counts,
        total: review.comments.length,
      };
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/repositories"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← リポジトリ一覧へ
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">
        {repository.owner}/{repository.name}
      </h1>

      <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/repositories/${id}?tab=${t.key}`}
            className={`px-3 py-2 text-sm ${
              tab === t.key
                ? "border-b-2 border-foreground font-medium"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "pulls" && (
        <>
          {pullsError && (
            <p className="py-16 text-center text-sm text-red-600 dark:text-red-400">
              {pullsError}
            </p>
          )}
          {pulls && pulls.length === 0 && (
            <p className="py-16 text-center text-sm text-zinc-500">
              オープンなPRはありません
            </p>
          )}
          {pulls && pulls.length > 0 && (
            <PullRequestList
              repositoryId={id}
              pulls={pulls}
              prompts={prompts}
            />
          )}
        </>
      )}

      {tab === "history" && reviews && (
        <ul className="flex flex-col gap-2">
          {reviews.length === 0 && (
            <li className="py-16 text-center text-sm text-zinc-500">
              レビュー履歴はまだありません
            </li>
          )}
          {reviews.map((review) => (
            <li key={review.id}>
              <Link
                href={`/reviews/${review.id}`}
                className="block rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <p className="text-sm font-medium">
                  #{review.pullRequestNumber} {review.pullRequestTitle}
                </p>
                <p className="text-xs text-zinc-500">
                  {review.createdAt.toLocaleString("ja-JP")} · {review.status} ·{" "}
                  {review._count.comments}件の指摘
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === "trends" && severityTotals && (
        <div className="flex flex-col gap-8">
          {trendReviews.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">
              成功したレビューがまだありません
            </p>
          ) : (
            <>
              <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-500">
                  累計の指摘件数
                </h2>
                <div className="flex gap-6">
                  {SEVERITIES.map((s) => (
                    <div key={s}>
                      <p className={`text-2xl font-semibold ${SEVERITY_TEXT[s]}`}>
                        {severityTotals![s]}
                      </p>
                      <p className="text-xs text-zinc-500">{s}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-500">
                  直近{trendReviews.length}件のレビュー(新しい順)
                </h2>
                <ul className="flex flex-col gap-2">
                  {trendReviews.map((review) => (
                    <li key={review.id}>
                      <Link
                        href={`/reviews/${review.id}`}
                        className="block rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            #{review.pullRequestNumber} {review.pullRequestTitle}
                          </p>
                          <p className="shrink-0 text-xs text-zinc-500">
                            {review.createdAt.toLocaleDateString("ja-JP")} ·{" "}
                            {review.total}件
                          </p>
                        </div>
                        {review.total > 0 && (
                          <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            {SEVERITIES.map((s) =>
                              review.counts[s] > 0 ? (
                                <div
                                  key={s}
                                  className={SEVERITY_BG[s]}
                                  style={{
                                    width: `${(review.counts[s] / review.total) * 100}%`,
                                  }}
                                />
                              ) : null,
                            )}
                          </div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-500">
                  指摘の多いファイル
                </h2>
                {topFiles.length === 0 ? (
                  <p className="text-sm text-zinc-500">指摘はまだありません</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {topFiles.map((f) => (
                      <li
                        key={f.filePath}
                        className="flex items-center justify-between gap-3 border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800/60"
                      >
                        <span className="truncate font-mono text-xs">
                          {f.filePath}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {f.count}件
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
