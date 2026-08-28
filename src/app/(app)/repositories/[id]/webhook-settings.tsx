"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";

type Prompt = { id: string; title: string; usesDiff: boolean };

export function WebhookSettings({
  repositoryId,
  webhookEnabled,
  defaultPromptId,
  prompts,
}: {
  repositoryId: string;
  webhookEnabled: boolean;
  defaultPromptId: string | null;
  prompts: Prompt[];
}) {
  const router = useRouter();
  const [promptId, setPromptId] = useState(
    defaultPromptId ?? prompts.find((p) => p.usesDiff)?.id ?? prompts[0]?.id ?? "",
  );
  const enable = useApiMutation();
  const disable = useApiMutation();

  const selectedPrompt = prompts.find((p) => p.id === promptId);

  async function handleEnable() {
    if (!promptId) return;
    const result = await enable.mutate(
      `/api/repositories/${repositoryId}/webhook`,
      { method: "POST", body: { promptId } },
      "Webhookの設定に失敗しました",
    );
    if (!result) return;
    router.refresh();
  }

  async function handleDisable() {
    const result = await disable.mutate(
      `/api/repositories/${repositoryId}/webhook`,
      { method: "DELETE" },
      "Webhookの無効化に失敗しました",
    );
    if (result === null) return;
    router.refresh();
  }

  if (prompts.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Webhook自動レビューに使うプロンプトがまだありません。先にプロンプトを作成してください。
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">自動レビュー</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            PRの作成・更新(open/synchronize)時に自動でレビューを実行します
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            webhookEnabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {webhookEnabled ? "有効" : "無効"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          onClick={handleEnable}
          disabled={enable.pending || !selectedPrompt?.usesDiff}
          className="inline-flex items-center gap-1.5 rounded bg-accent transition-opacity hover:opacity-90 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {enable.pending && <Spinner className="h-3.5 w-3.5" />}
          {webhookEnabled ? "デフォルトプロンプトを更新" : "有効化"}
        </button>
        {webhookEnabled && (
          <button
            onClick={handleDisable}
            disabled={disable.pending}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            {disable.pending && <Spinner className="mr-1 inline h-3.5 w-3.5" />}
            無効化
          </button>
        )}
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

      {(enable.error || disable.error) && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {enable.error ?? disable.error}
        </p>
      )}
    </div>
  );
}
