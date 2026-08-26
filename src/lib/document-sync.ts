import { prisma } from "@/lib/prisma";
import { chunkMarkdown } from "@/lib/document-chunks";
import { setDocumentChunkEmbedding } from "@/lib/embeddings";

// 本番環境ではDBがVercelのFunctionから地理的に離れている場合があり、
// ファイル数だけ発生するdeleteMany+createの往復がPrismaの既定の
// トランザクションタイムアウト(5秒)を超えることがあるため延長する。
const SYNC_TRANSACTION_TIMEOUT_MS = 30_000;

export type SyncTargetFile = { sourcePath: string; content: string };
export type PreparedSyncFile = SyncTargetFile & { chunks: string[] };

// ai-forge自身のdocs同期(/api/documents/sync)・接続済みリポジトリのdocs同期
// (/api/repositories/:id/documents/sync)で共通の「Markdownをチャンク分割する」処理。
// embedDocuments()の呼び出しはあえてここに含めず呼び出し元に残す(voyageErrorResponse
// でVoyage AI呼び出し失敗だけを判別してレスポンスを組み立てるため。writeSyncedDocuments
// 側のDBエラーまで同じcatchで「埋め込みの生成に失敗しました」と誤表示しないようにする)。
export function prepareSyncFiles(
  targets: SyncTargetFile[],
): { files: PreparedSyncFile[]; allChunkTexts: string[] } {
  const files = targets
    .map((target) => ({ ...target, chunks: chunkMarkdown(target.content) }))
    .filter((file) => file.chunks.length > 0);

  return { files, allChunkTexts: files.flatMap((f) => f.chunks) };
}

// 埋め込み生成後に呼ぶ。同じsourcePath(+repositoryId)のDocumentを丸ごと作り直す
// (差分検出はせず全置き換え。docs/phase3-design.md参照)。repositoryIdはai-forge
// 自身の同期ではnull。
export async function writeSyncedDocuments(
  userId: string,
  repositoryId: string | null,
  files: PreparedSyncFile[],
  embeddings: number[][],
): Promise<{ syncedDocuments: number; syncedChunks: number }> {
  let embeddingIndex = 0;
  const chunkIdsInOrder: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const file of files) {
        await tx.document.deleteMany({
          where: { userId, repositoryId, sourcePath: file.sourcePath },
        });
        const document = await tx.document.create({
          data: {
            title: file.sourcePath,
            content: file.content,
            sourceType: "REPO_FILE",
            sourcePath: file.sourcePath,
            userId,
            repositoryId,
            chunks: {
              create: file.chunks.map((chunkContent, chunkIndex) => ({
                chunkIndex,
                content: chunkContent,
              })),
            },
          },
          include: { chunks: { orderBy: { chunkIndex: "asc" } } },
        });
        chunkIdsInOrder.push(...document.chunks.map((c) => c.id));
      }
    },
    { timeout: SYNC_TRANSACTION_TIMEOUT_MS },
  );

  await Promise.all(
    chunkIdsInOrder.map((id) => setDocumentChunkEmbedding(id, embeddings[embeddingIndex++])),
  );

  return {
    syncedDocuments: files.length,
    syncedChunks: files.reduce((sum, f) => sum + f.chunks.length, 0),
  };
}
