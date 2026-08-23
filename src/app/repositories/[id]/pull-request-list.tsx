"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PullRequest = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  updatedAt: string;
};

type Prompt = { id: string; title: string };

export function PullRequestList({
  repositoryId,
  pulls,
  prompts,
}: {
  repositoryId: string;
  pulls: PullRequest[];
  prompts: Prompt[];
}) {
  const router = useRouter();
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [promptId, setPromptId] = useState(prompts[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(pr: PullRequest) {
    if (!promptId) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/repositories/${repositoryId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pullRequestNumber: pr.number, promptId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "レビューの実行に失敗しました");
        return;
      }
      router.push(`/reviews/${data.id}`);
    } finally {
      setPending(false);
    }
  }

  if (prompts.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        レビューに使うプロンプトがまだありません。先にプロンプトを作成してください。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {pulls.map((pr) => (
        <li
          key={pr.number}
          className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium hover:underline"
              >
                #{pr.number} {pr.title}
              </a>
              <p className="text-xs text-zinc-500">
                {pr.author && `${pr.author} · `}
                {new Date(pr.updatedAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
            <button
              onClick={() => setOpenFor(openFor === pr.number ? null : pr.number)}
              className="shrink-0 rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
            >
              レビューを実行
            </button>
          </div>

          {openFor === pr.number && (
            <div className="mt-3 flex items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <select
                value={promptId}
                onChange={(e) => setPromptId(e.target.value)}
                className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleRun(pr)}
                disabled={pending}
                className="rounded bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
              >
                {pending ? "実行中..." : "実行"}
              </button>
            </div>
          )}

          {openFor === pr.number && error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
