import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { RepositoryManager } from "./repository-manager";

export default async function RepositoriesPage() {
  const userId = await requireUserId();

  const repositories = await prisma.repository.findMany({
    where: { userId },
    include: { _count: { select: { reviews: true } } },
    orderBy: { connectedAt: "desc" },
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
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
