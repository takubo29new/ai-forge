import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parsePageSize } from "@/lib/list-limits";
import { DocumentManager } from "./document-manager";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const userId = await requireUserId();
  const { limit: limitParam } = await searchParams;
  const limit = parsePageSize(limitParam);

  const [documents, lastSyncedDocument, pendingEmbeddingCount] = await Promise.all([
    prisma.document.findMany({
      where: { userId },
      include: { _count: { select: { chunks: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    // 「設計書を同期」の最終実行日時。再同期のたびにDocumentを作り直す
    // (updatedAt = createdAt = 実行時刻になる)ため、REPO_FILE Documentの
    // 最新updatedAtがそのまま最終同期日時になる。
    prisma.document.findFirst({
      where: { userId, sourceType: "REPO_FILE" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    // 埋め込み未生成のレビュー指摘数。バックフィルボタンを押す必要が
    // あるかどうかを、実行日時よりも直接的に示す指標として使う。
    prisma.reviewComment.count({
      where: { review: { userId }, embedding: null },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="mb-2 text-xl font-semibold">ドキュメント</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          登録したドキュメントはチャンクに分割され、埋め込みベクトルとして保存されます(RAG検索チャット「/chat」の検索対象)。
        </p>
      </div>
      <DocumentManager
        initialDocuments={documents.map((d) => ({
          id: d.id,
          title: d.title,
          sourceType: d.sourceType,
          chunkCount: d._count.chunks,
          createdAt: d.createdAt.toISOString(),
        }))}
        initialLastSyncedAt={lastSyncedDocument?.updatedAt.toISOString() ?? null}
        initialPendingEmbeddingCount={pendingEmbeddingCount}
        currentLimit={limit}
      />
    </div>
  );
}
