"use client";

import { useState } from "react";
import Link from "next/link";

type ReviewRow = {
  id: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  createdAt: string;
  status: string;
  commentCount: number;
  triggeredVia: "UI" | "CHAT" | "WEBHOOK";
};

// 一度に比較するのは2件までにする(3件以上の横並びはUIが複雑になるため、
// まずはシンプルな2件比較から。追加機能アイデア「実行結果の比較機能」参照)。
const MAX_COMPARE = 2;

export function ReviewHistory({
  repositoryId,
  reviews,
}: {
  repositoryId: string;
  reviews: ReviewRow[];
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

  if (reviews.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        レビュー履歴はまだありません
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length === MAX_COMPARE && (
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-lg border border-accent bg-background px-4 py-2 text-sm shadow-sm">
          <span>2件を選択中</span>
          <Link
            href={`/repositories/${repositoryId}/compare?a=${selected[0]}&b=${selected[1]}`}
            className="rounded bg-accent transition-opacity hover:opacity-90 px-3 py-1.5 text-xs font-medium text-white"
          >
            比較する
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {reviews.map((review) => (
          <li key={review.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(review.id)}
              onChange={() => toggle(review.id)}
              aria-label="比較対象として選択"
              className="shrink-0"
            />
            <Link
              href={`/reviews/${review.id}`}
              className="block min-w-0 flex-1 rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <p className="truncate text-sm font-medium">
                #{review.pullRequestNumber} {review.pullRequestTitle}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(review.createdAt).toLocaleString("ja-JP")} ·{" "}
                {review.status} · {review.commentCount}件の指摘
                {review.triggeredVia === "CHAT" && (
                  <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                    チャットから実行
                  </span>
                )}
                {review.triggeredVia === "WEBHOOK" && (
                  <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-accent">
                    Webhookで自動実行
                  </span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
