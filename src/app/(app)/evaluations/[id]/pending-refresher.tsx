"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

// このページを開いたまま結果を待っているユーザー向けに、PENDING中だけ
// Server Componentを再取得してステータスの変化を反映する。ページを離れた後の
// 通知はPendingEvaluationsProvider(レイアウト常駐)のトーストが担当する
// (docs/phases/phase5-design.md「バックグラウンド処理」参照)。
export function PendingRefresher() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
