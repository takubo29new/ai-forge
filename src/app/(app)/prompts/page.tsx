import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; q?: string }>;
}) {
  const userId = await requireUserId();

  const { categoryId, q } = await searchParams;

  const [categories, prompts] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
    prisma.prompt.findMany({
      where: {
        userId,
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <form method="GET" className="mb-6 flex flex-wrap items-center gap-3">
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
  );
}
