import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Markdown } from "@/components/markdown";
import { SEVERITIES, SEVERITY_TEXT, SEVERITY_ICON, countBySeverity } from "@/lib/review-severity";

// ログイン不要の読み取り専用公開ページ。shareTokenが一致するレビューのみを
// 表示し、userIdでの所有者チェックは行わない(トークン自体が公開用の鍵)。
export default async function SharedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const review = await prisma.review.findUnique({
    where: { shareToken: token },
    include: {
      repository: true,
      execution: true,
      comments: { orderBy: { filePath: "asc" } },
    },
  });

  if (!review) {
    notFound();
  }

  const counts = countBySeverity(review.comments);

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

      <h1 className="mb-1 text-xl font-semibold">
        <a href={review.pullRequestUrl} target="_blank" rel="noreferrer" className="hover:underline">
          #{review.pullRequestNumber} {review.pullRequestTitle}
        </a>
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        {review.repository.owner}/{review.repository.name}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span>実行: {review.createdAt.toLocaleString("ja-JP")}</span>
        {review.execution && <span>{review.execution.model}</span>}
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
      </div>

      {review.comments.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          指摘事項はありませんでした
        </p>
      )}

      {review.comments.length > 0 && (
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

      <p className="mt-10 text-center text-xs text-zinc-400">
        <Link href="/" className="hover:underline">
          ai-forge
        </Link>
        で作成されたAIレビュー結果です
      </p>
    </div>
  );
}
