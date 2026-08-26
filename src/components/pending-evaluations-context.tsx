"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useToast } from "./toast-provider";

type PendingEvaluationsContextValue = {
  // 新規作成直後のEvaluationを監視対象に加える(次のポーリングを待たずに
  // 即座に監視を開始するため)。
  registerPending: (id: string) => void;
};

const PendingEvaluationsContext = createContext<PendingEvaluationsContextValue | null>(null);

const POLL_INTERVAL_MS = 5000;

type EvaluationStatusRow = { id: string; title: string; status: "PENDING" | "SUCCESS" | "FAILED" };

// AI評価(Phase 5、画像・テキスト共通)はバックグラウンドで実行されるため、実行を依頼した画面から
// 離れても完了に気づけるよう、(app)レイアウトに常駐してPENDINGなEvaluationを
// ポーリングし、完了時にトースト通知する(docs/phases/phase5-design.md「バックグラウンド
// 処理」参照)。ToastProviderと同じくレイアウトに1つだけマウントされ、アプリ内の
// 画面遷移(クライアントサイドナビゲーション)をまたいで動き続ける。
export function PendingEvaluationsProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (pendingIdsRef.current.size === 0) return;
    const res = await fetch("/api/evaluations");
    if (!res.ok) return;
    const evaluations: EvaluationStatusRow[] = await res.json();

    for (const id of Array.from(pendingIdsRef.current)) {
      const evaluation = evaluations.find((e) => e.id === id);
      // 削除された場合も含め、現在PENDINGでなければ監視対象から外す。
      if (evaluation && evaluation.status === "PENDING") continue;
      pendingIdsRef.current.delete(id);
      if (!evaluation) continue;
      showToast(
        evaluation.status === "SUCCESS"
          ? `評価「${evaluation.title}」が完了しました`
          : `評価「${evaluation.title}」の実行に失敗しました`,
      );
    }

    if (pendingIdsRef.current.size === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [showToast]);

  const ensurePolling = useCallback(() => {
    if (!intervalRef.current) {
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }
  }, [poll]);

  const registerPending = useCallback(
    (id: string) => {
      pendingIdsRef.current.add(id);
      ensurePolling();
    },
    [ensurePolling],
  );

  // レイアウトが最初にマウントされた時点(ページの初回読み込み・再読み込み)で、
  // 既にPENDINGなEvaluationが無いか確認し、あれば監視を再開する(作成直後に
  // ページを離れた・リロードした場合でも通知漏れが起きないようにするため)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/evaluations");
      if (!res.ok || cancelled) return;
      const evaluations: EvaluationStatusRow[] = await res.json();
      for (const e of evaluations) {
        if (e.status === "PENDING") pendingIdsRef.current.add(e.id);
      }
      if (pendingIdsRef.current.size > 0) ensurePolling();
    })();
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // ensurePollingはshowToast(ToastProvider側でuseCallback(..., [])により
    // 安定)経由で参照が安定しているため、依存に含めても再実行はマウント時の
    // 1回のみになる。
  }, [ensurePolling]);

  return (
    <PendingEvaluationsContext.Provider value={{ registerPending }}>
      {children}
    </PendingEvaluationsContext.Provider>
  );
}

export function usePendingEvaluations() {
  const ctx = useContext(PendingEvaluationsContext);
  if (!ctx) {
    throw new Error("usePendingEvaluations must be used within a PendingEvaluationsProvider");
  }
  return ctx;
}
