import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { categoryId, q } = await searchParams;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const [categories, prompts] = await Promise.all([
    prisma.category.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    }),
    prisma.prompt.findMany({
      where: {
        userId: session.user.id,
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        category: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

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
          <Link
            href="/repositories"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            リポジトリ
          </Link>
          <Link
            href="/help"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ヘルプ
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

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <form
          method="GET"
          className="mb-6 flex flex-wrap items-center gap-3"
        >
          <select
            name="categoryId"
            defaultValue={categoryId ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">カテゴリ: すべて</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="タイトルで検索"
            className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            絞り込み
          </button>
          <Link
            href="/prompts/new"
            className="ml-auto rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background"
          >
            + 新規作成
          </Link>
        </form>

        {prompts.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            プロンプトがまだありません
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {prompts.map((prompt) => (
              <li key={prompt.id}>
                <Link
                  href={`/prompts/${prompt.id}`}
                  className="block rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <p className="font-medium">{prompt.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    カテゴリ: {prompt.category?.name ?? "未分類"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    更新: {prompt.updatedAt.toLocaleDateString("ja-JP")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
