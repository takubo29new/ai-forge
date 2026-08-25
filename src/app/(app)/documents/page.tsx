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

  const [
    documents,
    lastSyncedDocument,
    repositories,
    repoLastSynced,
    pendingEmbeddingCount,
    pendingPromptVersionEmbeddingCount,
    pendingExecutionEmbeddingCount,
  ] = await Promise.all([
    prisma.document.findMany({
      where: { userId },
      include: {
        _count: { select: { chunks: true } },
        repository: { select: { owner: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    // 「ai-forgeの設計書を同期」(repositoryId: null)の最終実行日時。再同期のたびに
    // Documentを作り直す(updatedAt = createdAt = 実行時刻になる)ため、該当する
    // REPO_FILE Documentの最新updatedAtがそのまま最終同期日時になる。
    prisma.document.findFirst({
      where: { userId, sourceType: "REPO_FILE", repositoryId: null },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.repository.findMany({
      where: { userId },
      orderBy: { connectedAt: "desc" },
      select: { id: true, owner: true, name: true },
    }),
    // 接続済みリポジトリごとの最終同期日時(上と同じ考え方)。
    prisma.document.groupBy({
      by: ["repositoryId"],
      where: { userId, sourceType: "REPO_FILE", repositoryId: { not: null } },
      _max: { updatedAt: true },
    }),
    // 埋め込み未生成のレビュー指摘数。バックフィルボタンを押す必要が
    // あるかどうかを、実行日時よりも直接的に示す指標として使う。
    prisma.reviewComment.count({
      where: { review: { userId }, embedding: null },
    }),
    // 埋め込み未生成のプロンプトバージョン数(Phase 4)。
    prisma.promptVersion.count({
      where: { prompt: { userId }, embedding: null },
    }),
    // 埋め込み未生成の実行結果数(Phase 4)。対象はreviewIdが無いSUCCESSな実行のみ
    // (レビュー由来のresultTextはReviewCommentとして既に埋め込み済みのため対象外)。
    prisma.execution.count({
      where: {
        userId,
        status: "SUCCESS",
        resultText: { not: null },
        review: null,
        embedding: null,
      },
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
          repositoryLabel: d.repository ? `${d.repository.owner}/${d.repository.name}` : null,
          chunkCount: d._count.chunks,
          createdAt: d.createdAt.toISOString(),
        }))}
        initialLastSyncedAt={lastSyncedDocument?.updatedAt.toISOString() ?? null}
        repositories={repositories.map((r) => {
          const lastSynced = repoLastSynced.find((g) => g.repositoryId === r.id);
          return {
            id: r.id,
            label: `${r.owner}/${r.name}`,
            lastSyncedAt: lastSynced?._max.updatedAt?.toISOString() ?? null,
          };
        })}
        initialPendingEmbeddingCount={pendingEmbeddingCount}
        initialPendingPromptVersionEmbeddingCount={pendingPromptVersionEmbeddingCount}
        initialPendingExecutionEmbeddingCount={pendingExecutionEmbeddingCount}
        currentLimit={limit}
      />
    </div>
  );
}
