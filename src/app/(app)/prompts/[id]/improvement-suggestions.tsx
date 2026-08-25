"use client";

import { useState } from "react";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Markdown } from "@/components/markdown";

type Suggestion = {
  pattern: string;
  suggestion: string;
  occurrenceCount: number;
};

type Result = {
  summary: string;
  suggestions: Suggestion[];
  commentCount: number;
};

// レビュー指摘蓄積からのプロンプト改善提案(Phase 4項目3)。専用テーブルを持たず、
// クリックのたびにPOST /api/prompts/:id/improvement-suggestionsを呼び直して
// その場で結果を表示するだけの機能(docs/phase4-design.md参照)。
export function ImprovementSuggestions({
  promptId,
  commentCount,
}: {
  promptId: string;
  commentCount: number;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const { mutate, pending, error } = useApiMutation();

  if (commentCount === 0) {
    return null;
  }

  async function handleClick() {
    const data = await mutate<Result>(
      `/api/prompts/${promptId}/improvement-suggestions`,
      { method: "POST" },
      "改善案の生成に失敗しました",
    );
    if (data) {
      setResult(data);
    }
  }

  return (
    <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">レビュー指摘からの改善提案</p>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          {pending
            ? "分析中…"
            : `過去${commentCount}件の指摘から改善案を見る`}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <p className="mb-1 text-xs font-medium text-zinc-500">総評</p>
            <Markdown>{result.summary}</Markdown>
          </div>

          {result.suggestions.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              繰り返し発生している指摘パターンは見つかりませんでした
            </p>
          )}

          {result.suggestions.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <p className="text-sm font-medium">
                {s.pattern}{" "}
                <span className="ml-1 text-xs text-zinc-500">
                  ({s.occurrenceCount}件)
                </span>
              </p>
              <div className="mt-1">
                <Markdown>{s.suggestion}</Markdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
