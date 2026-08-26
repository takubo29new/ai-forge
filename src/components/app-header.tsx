import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { getSession } from "@/lib/session";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorLogIcon, HelpIcon } from "@/components/icons";
import { NavLinks } from "@/components/nav-links";

// プロンプト関連(プロンプト一覧・そのカテゴリ管理)とそれ以外の機能を
// 視覚的に区切って表示する。カテゴリ管理は単体では意味を持たず、あくまで
// プロンプトの分類機能であることが分かるよう、プロンプトの隣に置く。
const PROMPT_NAV_LINKS = [
  { href: "/prompts", label: "プロンプト" },
  { href: "/categories", label: "カテゴリ管理" },
];

const OTHER_NAV_LINKS = [
  { href: "/repositories", label: "リポジトリ" },
  { href: "/documents", label: "ドキュメント" },
  { href: "/chat", label: "チャット" },
  { href: "/evaluations", label: "評価" },
];

export async function AppHeader() {
  const session = await getSession();
  if (!session?.user) return null;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/dashboard" className="font-semibold">
          ai-forge
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-zinc-300 sm:block dark:bg-zinc-700" aria-hidden />
        <NavLinks links={PROMPT_NAV_LINKS} />
        <span className="mx-1 hidden h-4 w-px bg-zinc-300 sm:block dark:bg-zinc-700" aria-hidden />
        <NavLinks links={OTHER_NAV_LINKS} />
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/errors"
          title="エラーログ"
          aria-label="エラーログ"
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <ErrorLogIcon />
        </Link>
        <Link
          href="/help"
          title="ヘルプ"
          aria-label="ヘルプ"
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <HelpIcon />
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-zinc-300 sm:block dark:bg-zinc-700" aria-hidden />
        <ThemeToggle />
        {session.user.image && (
          <Image
            src={session.user.image}
            alt={session.user.name ?? "ユーザーアイコン"}
            width={28}
            height={28}
            className="rounded-full"
          />
        )}
        <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
          {session.user.name}
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
