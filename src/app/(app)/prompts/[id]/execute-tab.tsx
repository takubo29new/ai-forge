"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/models";
import { extractVariableNames } from "@/lib/prompt-variables";
import { Markdown } from "@/components/markdown";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";
import { submitOnModEnter } from "@/lib/keyboard-shortcuts";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";

type Version = { id: string; versionNumber: number; content: string };

type ExecutionResult = {
  status: "SUCCESS" | "FAILED";
  resultText: string | null;
  errorMessage: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
};

export function ExecuteTab({
  promptId,
  versions,
}: {
  promptId: string;
  versions: Version[];
}) {
  const router = useRouter();
  const [versionId, setVersionId] = useState(versions[0]?.id ?? "");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const { mutate, pending, error } = useApiMutation();

  const selectedVersion = versions.find((v) => v.id === versionId);
  const variableNames = useMemo(
    () => (selectedVersion ? extractVariableNames(selectedVersion.content) : []),
    [selectedVersion],
  );

  async function handleExecute(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const data = await mutate<ExecutionResult>(
      `/api/prompts/${promptId}/execute`,
      {
        method: "POST",
        body: { promptVersionId: versionId, model, variables: variableValues },
      },
      "実行に失敗しました",
    );
    if (!data) return;
    setResult(data);
    router.refresh();
  }

  if (versions.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        実行するにはまず本文を保存してください。
      </p>
    );
  }

  return (
    <form onSubmit={handleExecute} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
            実行対象バージョン
          </label>
          <select
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber}
                {i === 0 ? "(最新)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">モデル</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {variableNames.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">変数</p>
          {variableNames.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <label className="w-32 shrink-0 text-sm">{name}</label>
              <input
                value={variableValues[name] ?? ""}
                onChange={(e) =>
                  setVariableValues((prev) => ({
                    ...prev,
                    [name]: e.target.value,
                  }))
                }
                onKeyDown={submitOnModEnter}
                className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">Ctrl/⌘+Enterで実行できます</p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 self-start rounded-full bg-accent transition-opacity hover:opacity-90 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {pending ? "実行中..." : "実行"}
      </button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (() => {
        const StatusIcon = STATUS_ICON[result.status];
        return (
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">実行結果</p>
            {result.status === "SUCCESS" ? (
              <Markdown>{result.resultText ?? ""}</Markdown>
            ) : (
              <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {result.errorMessage}
              </p>
            )}
            <p className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <StatusIcon className={`h-3.5 w-3.5 ${STATUS_TEXT[result.status]}`} />
              <span className={STATUS_TEXT[result.status]}>{STATUS_LABEL[result.status]}</span>
              {result.status === "SUCCESS" &&
                ` / tokens: ${result.promptTokens}+${result.completionTokens} / ${result.durationMs}ms`}
            </p>
          </div>
        );
      })()}
    </form>
  );
}
