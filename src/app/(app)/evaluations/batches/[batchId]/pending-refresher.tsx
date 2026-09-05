"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

// バッチAI評価(Issue #108)。バッチ内のいずれかがまだPENDINGの間、Server
// Componentを再取得してステータスの変化を反映する
// (evaluations/[id]/pending-refresher.tsxと同じパターン)。
export function BatchPendingRefresher() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
