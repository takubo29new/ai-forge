import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "text-red-600 dark:text-red-400",
  WARNING: "text-amber-600 dark:text-amber-400",
  INFO: "text-zinc-500",
};

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      repository: true,
      execution: true,
      comments: { orderBy: { filePath: "asc" } },
    },
  });

  if (!review || review.userId !== session.user.id) {
    notFound();
  }

  const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 } as Record<string, number>;
  for (const c of review.comments) {
    counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  }

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
            <span className={SEVERITY_STYLE.CRITICAL}>
              CRITICAL {counts.CRITICAL}
            </span>
            <span className={SEVERITY_STYLE.WARNING}>WARNING {counts.WARNING}</span>
            <span className={SEVERITY_STYLE.INFO}>INFO {counts.INFO}</span>
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
                <span className={`text-xs ${SEVERITY_STYLE[c.severity]}`}>
                  [{c.severity}]
                </span>
              </p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
