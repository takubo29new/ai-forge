"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "./icons";

type NotificationRow = {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_INTERVAL_MS = 20000;

// ヘッダーのベルアイコン+ドロップダウン。AI評価などバックグラウンド処理の
// 完了はトースト(その場にいる間だけ見える)に加えてNotificationとして
// 残るため、ここでは独立にポーリングして一覧・未読件数を表示する
// (PendingEvaluationsProviderのようなクライアント側の監視状態には依存しない。
// 他のタブ・別セッションで作成された評価の完了も拾える設計)。
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data: { notifications: NotificationRow[]; unreadCount: number } =
      await res.json();
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  useEffect(() => {
    // 初回取得はsetIntervalのコールバックと同じ「イベント経由」の扱いにするため
    // setTimeout(…, 0)越しに呼ぶ(effect本体から直接setStateを呼ぶ形にすると
    // react-hooks/set-state-in-effectに抵触するため。command-palette.tsx等と同じ回避策)。
    const initial = setTimeout(fetchNotifications, 0);
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="通知"
        aria-label="通知"
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <span className="text-sm font-medium">通知</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-accent hover:underline"
              >
                すべて既読にする
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                通知はありません
              </p>
            )}
            <ul>
              {notifications.map((n) => {
                const body = (
                  <>
                    <p
                      className={`text-sm ${n.read ? "text-zinc-500 dark:text-zinc-400" : "font-medium"}`}
                    >
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {new Date(n.createdAt).toLocaleString("ja-JP")}
                    </p>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                  >
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          setOpen(false);
                          if (!n.read) markRead(n.id);
                        }}
                        className="block px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-3 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
