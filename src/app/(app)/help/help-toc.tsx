"use client";

import { useEffect, useState } from "react";

type Section = { id: string; label: string };

// 各セクションの見出しがビューポート上部付近を通過したタイミングで
// アクティブなセクションを切り替える(スクロールスパイ)。
export function HelpToc({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      // 画面上部20%〜60%の帯に入った見出しをアクティブとみなす
      { rootMargin: "-20% 0px -60% 0px" },
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  // クリック時はブラウザのネイティブなアンカー遷移(+IntersectionObserverによる
  // ハイライト更新)に任せず、対象セクションへ直接scrollIntoWindowし、ハイライトも
  // 即座に切り替える。スムーズスクロール中に他の見出しが観測範囲を通過して
  // ハイライトが横取りされたり、遷移先がずれて見えたりするのを防ぐため。
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", `#${id}`);
    setActiveId(id);
  }

  return (
    <nav className="flex gap-1 overflow-x-auto md:sticky md:top-6 md:flex-col md:gap-0.5 md:overflow-visible">
      <p className="hidden text-xs font-medium text-zinc-500 dark:text-zinc-400 md:mb-2 md:block">
        目次
      </p>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => handleClick(e, s.id)}
          className={`shrink-0 rounded px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors md:whitespace-normal ${
            activeId === s.id
              ? "bg-accent/10 font-medium text-accent"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
