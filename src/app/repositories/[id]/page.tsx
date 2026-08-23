import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient, listOpenPullRequests } from "@/lib/github";
import { PullRequestList } from "./pull-request-list";

const TABS = [
  { key: "pulls", label: "オープンなPR" },
  { key: "history", label: "レビュー履歴" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function RepositoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "pulls";

  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== session.user.id) {
    notFound();
  }

  let pulls: Awaited<ReturnType<typeof listOpenPullRequests>> | null = null;
  let pullsError: string | null = null;
  let prompts: { id: string; title: string; usesDiff: boolean }[] = [];
  if (tab === "pulls") {
    const octokit = await getGitHubClient(session.user.id);
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
      where: { userId: session.user.id },
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
    </div>
  );
}
