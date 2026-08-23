import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { NewPromptForm } from "./new-prompt-form";

export default async function NewPromptPage() {
  const userId = await requireUserId();

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-4 mb-6 text-xl font-semibold">プロンプト新規作成</h1>
      <NewPromptForm categories={categories} />
    </div>
  );
}
