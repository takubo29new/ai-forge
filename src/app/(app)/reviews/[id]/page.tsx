import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { SEVERITY_TEXT, countBySeverity } from "@/lib/review-severity";

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

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
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
      <p className="mb-4 text-sm text-zinc-500">
        {review.repository.owner}/{review.repository.name}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
        <span>status: {review.status}</span>
        <span>実行: {review.createdAt.toLocaleString("ja-JP")}</span>
        {review.execution && <span>{review.execution.model}</span>}
        {review.status === "SUCCESS" && (
          <span className="flex gap-3">
            <span className={SEVERITY_TEXT.CRITICAL}>
              CRITICAL {counts.CRITICAL}
            </span>
            <span className={SEVERITY_TEXT.WARNING}>WARNING {counts.WARNING}</span>
            <span className={SEVERITY_TEXT.INFO}>INFO {counts.INFO}</span>
          </span>
        )}
      </div>

      {review.status === "FAILED" && (
        <p className="rounded-lg border border-red-200 px-4 py-3 text-sm text-red-600 dark:border-red-900 dark:text-red-400">
          {review.execution?.errorMessage ?? "レビューの実行に失敗しました"}
        </p>
      )}

      {review.status === "SUCCESS" && review.comments.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          指摘事項はありませんでした
        </p>
      )}

      {review.status === "SUCCESS" && review.comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {review.comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <p className="text-sm font-medium">
                {c.filePath}
                {c.line !== null && `:${c.line}`}{" "}
                <span className={`text-xs ${SEVERITY_TEXT[c.severity]}`}>
                  [{c.severity}]
                </span>
              </p>
              <div className="mt-1">
                <Markdown>{c.body}</Markdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
