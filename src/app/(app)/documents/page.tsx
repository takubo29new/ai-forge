import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parsePageSize } from "@/lib/list-limits";
import { PageSizeSelect } from "@/components/page-size-select";
import { DocumentManager } from "./document-manager";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const userId = await requireUserId();
  const { limit: limitParam } = await searchParams;
  const limit = parsePageSize(limitParam);

  const documents = await prisma.document.findMany({
    where: { userId },
    include: { _count: { select: { chunks: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <div className="mt-4 mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="mb-2 text-xl font-semibold">ドキュメント</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            登録したドキュメントはチャンクに分割され、埋め込みベクトルとして保存されます(RAG検索チャット「/chat」の検索対象)。
          </p>
        </div>
        <PageSizeSelect current={limit} />
      </div>
      <DocumentManager
        initialDocuments={documents.map((d) => ({
          id: d.id,
          title: d.title,
          sourceType: d.sourceType,
          chunkCount: d._count.chunks,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
