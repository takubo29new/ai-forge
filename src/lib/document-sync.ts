import { prisma } from "@/lib/prisma";
import { chunkMarkdown } from "@/lib/document-chunks";
import { embedDocuments } from "@/lib/voyage";
import { setDocumentChunkEmbedding } from "@/lib/embeddings";

// 本番環境ではDBがVercelのFunctionから地理的に離れている場合があり、
// ファイル数だけ発生するdeleteMany+createの往復がPrismaの既定の
// トランザクションタイムアウト(5秒)を超えることがあるため延長する。
const SYNC_TRANSACTION_TIMEOUT_MS = 30_000;

export type SyncTargetFile = { sourcePath: string; content: string };

// ai-forge自身のdocs同期(/api/documents/sync)・接続済みリポジトリのdocs同期
// (/api/repositories/:id/documents/sync)で共通の「Markdownファイル一覧を
// チャンク分割・埋め込み生成してDocumentとして作り直す」処理。取得方法(ローカル
// fs vs GitHub API)だけが呼び出し元ごとに異なる(docs/phase4-design.md参照)。
// repositoryIdはai-forge自身の同期ではnull。
export async function syncMarkdownDocuments(
  userId: string,
  repositoryId: string | null,
  targets: SyncTargetFile[],
): Promise<{ syncedDocuments: number; syncedChunks: number }> {
  const files = targets
    .map((target) => ({ ...target, chunks: chunkMarkdown(target.content) }))
    .filter((file) => file.chunks.length > 0);

  const allChunkTexts = files.flatMap((f) => f.chunks);
  if (allChunkTexts.length === 0) {
    return { syncedDocuments: 0, syncedChunks: 0 };
  }

  // 埋め込み失敗時はDBへの書き込みを一切行わない(部分的な作り直しで
  // 検索対象外の状態が残ることを避けるため)。呼び出し元でVoyageApiErrorを
  // 捕捉してレスポンスを組み立てる想定であるため、ここでは投げっぱなしにする。
  const embeddings = await embedDocuments(allChunkTexts);

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

  return { syncedDocuments: files.length, syncedChunks: allChunkTexts.length };
}
