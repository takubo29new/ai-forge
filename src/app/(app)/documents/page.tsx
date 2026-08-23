import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { LIST_LIMIT } from "@/lib/list-limits";
import { DocumentManager } from "./document-manager";

export default async function DocumentsPage() {
  const userId = await requireUserId();

  const documents = await prisma.document.findMany({
    where: { userId },
    include: { _count: { select: { chunks: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-semibold">ドキュメント</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        登録したドキュメントはチャンクに分割され、埋め込みベクトルとして保存されます(Phase
        3・RAG検索チャットの検索対象。チャット画面は未実装)。
      </p>
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
