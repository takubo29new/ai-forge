import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { getSession } from "@/lib/session";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "/categories", label: "カテゴリ管理" },
  { href: "/repositories", label: "リポジトリ" },
  { href: "/documents", label: "ドキュメント" },
  { href: "/errors", label: "エラーログ" },
  { href: "/help", label: "ヘルプ" },
];

export async function AppHeader() {
  const session = await getSession();
  if (!session?.user) return null;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <nav className="flex items-center gap-4">
        <Link href="/prompts" className="font-semibold">
          ai-forge
        </Link>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
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
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
