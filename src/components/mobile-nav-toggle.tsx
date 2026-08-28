"use client";

import { useEffect, useRef, useState } from "react";
import { NavLinks } from "@/components/nav-links";
import { MenuIcon, CloseIcon } from "@/components/icons";

type NavLink = { href: string; label: string };

// md未満の画面幅ではヘッダーのナビリンク(プロンプト系2件+その他5件)を
// 折りたたみ、このハンバーガーボタンから開くドロップダウンに集約する
// (notification-center.tsxと同じ外側クリック・Escapeで閉じるパターン)。
export function MobileNavToggle({
  promptLinks,
  otherLinks,
}: {
  promptLinks: NavLink[];
  otherLinks: NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="メニュー"
        aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open && (
        <nav className="absolute left-0 z-20 mt-2 flex w-56 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-2">
            <NavLinks links={promptLinks} onNavigate={() => setOpen(false)} />
          </div>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
          <div className="flex flex-col gap-2">
            <NavLinks links={otherLinks} onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      )}
    </div>
  );
}
