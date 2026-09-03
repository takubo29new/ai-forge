import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { SEVERITIES, SEVERITY_TEXT, SEVERITY_ICON, countBySeverity } from "@/lib/review-severity";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";
import { ShareControl } from "@/components/share-control";
import { formatDateTimeJST } from "@/lib/format-date";
import { ReviewAutoRefresh } from "@/components/review-auto-refresh";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      repository: true,
      execution: true,
      comments: { orderBy: { filePath: "asc" } },
    },
  });

  if (!review || review.userId !== userId) {
    notFound();
  }

  const counts = countBySeverity(review.comments);
  const StatusIcon = STATUS_ICON[review.status];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <ReviewAutoRefresh status={review.status} />
      <Link
        href={`/repositories/${review.repositoryId}?tab=history`}
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← リポジトリへ戻る
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold">
        <a href={review.pullRequestUrl} target="_blank" rel="noreferrer" className="hover:underline">
          #{review.pullRequestNumber} {review.pullRequestTitle}
        </a>
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        {review.repository.owner}/{review.repository.name}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span className={`inline-flex items-center gap-1 ${STATUS_TEXT[review.status]}`}>
          <StatusIcon className="h-4 w-4" />
          {STATUS_LABEL[review.status]}
        </span>
        <span>実行: {formatDateTimeJST(review.createdAt)}</span>
        {review.execution && <span>{review.execution.model}</span>}
        {review.triggeredVia === "CHAT" && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
            チャットから実行
          </span>
        )}
        {review.triggeredVia === "WEBHOOK" && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">
            Webhookで自動実行
          </span>
        )}
        {review.status === "SUCCESS" && (
          <span className="flex gap-3">
            {SEVERITIES.map((s) => {
              const SevIcon = SEVERITY_ICON[s];
              return (
                <span key={s} className={`inline-flex items-center gap-1 ${SEVERITY_TEXT[s]}`}>
                  <SevIcon className="h-4 w-4" />
                  {s} {counts[s]}
                </span>
              );
            })}
          </span>
        )}
      </div>

      {review.status === "SUCCESS" && (
        <div className="mb-6">
          <ShareControl
            kind="reviews"
            id={review.id}
            initialShareToken={review.shareToken}
          />
        </div>
      )}

      {(review.status === "PENDING" || review.status === "PROCESSING") && (
        <p className="flex items-start gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
          レビューを処理しています。しばらくすると自動的に結果が表示されます。
        </p>
      )}

      {review.status === "FAILED" && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:text-red-400">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {review.execution?.errorMessage ?? "レビューの実行に失敗しました"}
        </p>
      )}

      {review.status === "SUCCESS" && review.comments.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          指摘事項はありませんでした
        </p>
      )}

      {review.status === "SUCCESS" && review.comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {review.comments.map((c) => {
            const CommentSevIcon = SEVERITY_ICON[c.severity];
            return (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {c.filePath}
                  {c.line !== null && `:${c.line}`}
                  <span className={`inline-flex items-center gap-1 text-xs ${SEVERITY_TEXT[c.severity]}`}>
                    <CommentSevIcon className="h-3.5 w-3.5" />
                    {c.severity}
                  </span>
                </p>
                <div className="mt-1">
                  <Markdown>{c.body}</Markdown>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
