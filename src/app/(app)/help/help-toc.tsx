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

  return (
    <nav className="flex gap-1 overflow-x-auto md:sticky md:top-6 md:flex-col md:gap-0.5 md:overflow-visible">
      <p className="hidden text-xs font-medium text-zinc-500 md:mb-2 md:block">
        目次
      </p>
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`shrink-0 rounded px-2.5 py-1.5 text-sm whitespace-nowrap md:whitespace-normal ${
            activeId === s.id
              ? "bg-zinc-100 font-medium text-foreground dark:bg-zinc-800"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
