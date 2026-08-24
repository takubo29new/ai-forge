"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";

type PullRequest = {
  number: number;
  title: string;
  url: string;
  author: string | null;
  updatedAt: string;
};

type Prompt = { id: string; title: string; usesDiff: boolean };

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
  const [promptId, setPromptId] = useState(
    prompts.find((p) => p.usesDiff)?.id ?? prompts[0]?.id ?? "",
  );
  const { mutate, pending, error } = useApiMutation();

  const selectedPrompt = prompts.find((p) => p.id === promptId);

  async function handleRun(pr: PullRequest) {
    if (!promptId || !selectedPrompt?.usesDiff) return;
    const data = await mutate<{ id: string }>(
      `/api/repositories/${repositoryId}/reviews`,
      { method: "POST", body: { pullRequestNumber: pr.number, promptId } },
      "レビューの実行に失敗しました",
    );
    if (!data) return;
    router.push(`/reviews/${data.id}`);
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
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <select
                  value={promptId}
                  onChange={(e) => setPromptId(e.target.value)}
                  className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {!p.usesDiff && "(⚠ {{diff}}未使用)"}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleRun(pr)}
                  disabled={pending || !selectedPrompt?.usesDiff}
                  className="inline-flex items-center gap-1.5 rounded bg-accent transition-opacity hover:opacity-90 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {pending && <Spinner className="h-3.5 w-3.5" />}
                  {pending ? "実行中..." : "実行"}
                </button>
              </div>
              {selectedPrompt && !selectedPrompt.usesDiff && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  このプロンプトの本文に{" "}
                  <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
                    {"{{diff}}"}
                  </code>{" "}
                  が含まれていないため、コード差分がClaudeに渡りません。プロンプトを編集して追加してください。
                </p>
              )}
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
