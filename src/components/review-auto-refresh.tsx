"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

// レビューがPENDING/PROCESSINGの間、結果が出るまでポーリングして自動更新する
// (Issue #129のWebhook自動レビュー・手動レビューの非同期化に伴い、結果が
// 即座に揃わなくなったため)。サーバーコンポーネント側の再取得はrouter.refresh()に
// 任せ、このコンポーネント自体は表示を持たない。
export function ReviewAutoRefresh({ status }: { status: string }) {
  const router = useRouter();
  const isInProgress = status === "PENDING" || status === "PROCESSING";

  useEffect(() => {
    if (!isInProgress) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isInProgress, router]);

  return null;
}
