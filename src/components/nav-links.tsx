"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

// 現在地のリンクをアクセントカラーでハイライトする(サーバーコンポーネント
// のAppHeaderからはpathnameが取れないため、この部分だけクライアント化する)。
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              active
                ? "font-medium text-accent"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
