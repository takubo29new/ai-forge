import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { CategoryManager } from "./category-manager";

export default async function CategoriesPage() {
  const userId = await requireUserId();

  const categories = await prisma.category.findMany({
    where: { userId },
    include: { _count: { select: { prompts: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-4 mb-6 text-xl font-semibold">カテゴリ管理</h1>
      <CategoryManager
        initialCategories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          promptCount: c._count.prompts,
        }))}
      />
    </div>
  );
}
