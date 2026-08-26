import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { SEVERITIES, SEVERITY_TEXT, SEVERITY_ICON, countBySeverity } from "@/lib/review-severity";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";

export default async function ReviewComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const { a, b } = await searchParams;
  if (!a || !b) {
    notFound();
  }

  // このリポジトリに属するレビューのみを対象にする(URL改変で無関係な
  // レビューIDを渡された場合でも、他リポジトリの結果が混ざらないようにする)。
  const reviews = await prisma.review.findMany({
    where: { id: { in: [a, b] }, repositoryId: id },
    include: { comments: { orderBy: { filePath: "asc" } } },
  });

  if (reviews.length !== 2 || reviews.some((r) => r.userId !== userId)) {
    notFound();
  }

  const left = reviews.find((r) => r.id === a)!;
  const right = reviews.find((r) => r.id === b)!;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        href={`/repositories/${id}?tab=history`}
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← レビュー履歴へ戻る
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">レビュー結果の比較</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[left, right].map((review) => {
          const counts = countBySeverity(review.comments);
          const StatusIcon = STATUS_ICON[review.status];
          return (
            <div
              key={review.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="mb-1 text-sm font-medium">
                <Link href={`/reviews/${review.id}`} className="hover:underline">
                  #{review.pullRequestNumber} {review.pullRequestTitle}
                </Link>
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>{review.createdAt.toLocaleString("ja-JP")}</span>
                <span className={`inline-flex items-center gap-1 ${STATUS_TEXT[review.status]}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {STATUS_LABEL[review.status]}
                </span>
                {review.status === "SUCCESS" && (
                  <span className="flex gap-2">
                    {SEVERITIES.map((s) => {
                      const SevIcon = SEVERITY_ICON[s];
                      return (
                        <span key={s} className={`inline-flex items-center gap-1 ${SEVERITY_TEXT[s]}`}>
                          <SevIcon className="h-3.5 w-3.5" />
                          {s} {counts[s]}
                        </span>
                      );
                    })}
                  </span>
                )}
              </div>
              {review.status === "FAILED" && (
                <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  レビューの実行に失敗しました
                </p>
              )}
              {review.status === "SUCCESS" && review.comments.length === 0 && (
                <p className="text-xs text-zinc-500">指摘事項はありませんでした</p>
              )}
              {review.status === "SUCCESS" && review.comments.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {review.comments.map((c) => {
                    const CommentSevIcon = SEVERITY_ICON[c.severity];
                    return (
                      <li
                        key={c.id}
                        className="rounded border border-zinc-100 p-2 text-xs dark:border-zinc-800/60"
                      >
                        <p className="mb-1 flex items-center gap-1 font-medium">
                          {c.filePath}
                          {c.line !== null && `:${c.line}`}
                          <span className={`inline-flex items-center gap-1 ${SEVERITY_TEXT[c.severity]}`}>
                            <CommentSevIcon className="h-3 w-3" />
                            {c.severity}
                          </span>
                        </p>
                        <Markdown>{c.body}</Markdown>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
