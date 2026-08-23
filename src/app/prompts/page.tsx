import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function PromptsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <span className="font-semibold">ai-forge</span>
          <Link
            href="/categories"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            カテゴリ管理
          </Link>
        </div>
        <div className="flex items-center gap-3">
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
      <main className="flex flex-1 items-center justify-center px-6 text-center text-zinc-600 dark:text-zinc-400">
        <p>プロンプト一覧はこれから実装します。</p>
      </main>
    </div>
  );
}
