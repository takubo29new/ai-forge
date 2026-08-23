import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RepositoryManager } from "./repository-manager";

export default async function RepositoriesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const repositories = await prisma.repository.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { reviews: true } } },
    orderBy: { connectedAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← プロンプト一覧へ
      </Link>
      <h1 className="mt-4 mb-6 text-xl font-semibold">接続済みリポジトリ</h1>
      <RepositoryManager
        initialRepositories={repositories.map((r) => ({
          id: r.id,
          owner: r.owner,
          name: r.name,
          reviewCount: r._count.reviews,
          connectedAt: r.connectedAt.toISOString(),
        }))}
      />
    </div>
  );
}
