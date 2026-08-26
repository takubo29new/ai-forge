"use client";

import { useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";

type ExecutionRow = {
  id: string;
  createdAt: string;
  versionNumber: number;
  status: "SUCCESS" | "FAILED";
  model: string;
  resultText: string | null;
  errorMessage: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
};

// 一度に比較するのは2件までにする(3件以上の横並びはUIが複雑になるため、
// まずはシンプルな2件比較から。追加機能アイデア「実行結果の比較機能」参照)。
const MAX_COMPARE = 2;

export function ExecutionHistory({
  promptId,
  executions,
}: {
  promptId: string;
  executions: ExecutionRow[];
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // 既に2件選択済みの状態でさらに選ぶと、先に選んだ方を外して常に直近2件を保つ。
      if (prev.length >= MAX_COMPARE) return [prev[1], id];
      return [...prev, id];
    });
  }

  if (executions.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        実行履歴がまだありません
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length === MAX_COMPARE && (
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-lg border border-accent bg-background px-4 py-2 text-sm shadow-sm">
          <span>2件を選択中</span>
          <Link
            href={`/prompts/${promptId}/compare?a=${selected[0]}&b=${selected[1]}`}
            className="rounded bg-accent transition-opacity hover:opacity-90 px-3 py-1.5 text-xs font-medium text-white"
          >
            比較する
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {executions.map((e) => (
          <li
            key={e.id}
            className="flex items-start gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <input
              type="checkbox"
              checked={selected.includes(e.id)}
              onChange={() => toggle(e.id)}
              aria-label="比較対象として選択"
              className="mt-1.5 shrink-0"
            />
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer text-sm">
                <span className="text-zinc-500">
                  {new Date(e.createdAt).toLocaleString("ja-JP")}
                </span>{" "}
                <span className="font-medium">v{e.versionNumber}</span>{" "}
                <span
                  className={
                    e.status === "SUCCESS"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {e.status}
                </span>{" "}
                <span className="text-zinc-500">{e.model}</span>
              </summary>
              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                {e.status === "SUCCESS" ? (
                  <Markdown>{e.resultText ?? ""}</Markdown>
                ) : (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {e.errorMessage}
                  </p>
                )}
                {e.status === "SUCCESS" && (
                  <p className="mt-2 text-xs text-zinc-500">
                    tokens: {e.promptTokens}+{e.completionTokens} /{" "}
                    {e.durationMs}ms
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
