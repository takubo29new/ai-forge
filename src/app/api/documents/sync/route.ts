import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { chunkMarkdown } from "@/lib/document-chunks";
import { embedDocuments } from "@/lib/voyage";
import { setDocumentChunkEmbedding } from "@/lib/embeddings";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

// リポジトリ内の設計書を自動取り込みするための固定の対象一覧。ユーザー入力の
// パスを受け付けるとパストラバーサルの懸念があるため、あえて動的なパス指定は
// 許可せず、docs/配下のMarkdownファイルとルートの2ファイルに限定している。
// ルートの2ファイルはpath.join(process.cwd(), <リテラル文字列>)の形で個別に
// 書く(process.cwd()と変数を組み合わせるとNext.jsの静的解析がスコープを
// 特定できず、プロジェクト全体をサーバー関数にトレースしてしまうため)。
const ROOT_TARGETS = [
  { sourcePath: "README.md", fullPath: path.join(process.cwd(), "README.md") },
  {
    sourcePath: "ai-dev-tool-handoff.md",
    fullPath: path.join(process.cwd(), "ai-dev-tool-handoff.md"),
  },
];

async function listTargetFiles() {
  const docsDir = path.join(process.cwd(), "docs");
  const docsFiles = (await readdir(docsDir)).filter((f) => f.endsWith(".md"));

  return [
    ...ROOT_TARGETS,
    ...docsFiles.map((f) => ({
      sourcePath: `docs/${f}`,
      fullPath: path.join(docsDir, f),
    })),
  ];
}

// 再同期時は同じsourcePathのDocumentを丸ごと作り直す(差分検出はせず全置き換え。
// docs/phase3-design.md参照)。埋め込みはファイル横断でまとめて1回のVoyage AI
// 呼び出しにし、失敗時はDBへの書き込みを一切行わない(Documentの部分的な
// 作り直しで検索対象外の状態が残ることを避けるため)。
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimit = await checkDocumentRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const targets = await listTargetFiles();

  const files: { sourcePath: string; content: string; chunks: string[] }[] = [];
  for (const target of targets) {
    const content = await readFile(target.fullPath, "utf-8");
    const chunks = chunkMarkdown(content);
    if (chunks.length > 0) {
      files.push({ sourcePath: target.sourcePath, content, chunks });
    }
  }

  const allChunkTexts = files.flatMap((f) => f.chunks);
  if (allChunkTexts.length === 0) {
    return NextResponse.json({ syncedDocuments: 0, syncedChunks: 0 });
  }

  let embeddings: number[][];
  try {
    embeddings = await embedDocuments(allChunkTexts);
  } catch (error) {
    return voyageErrorResponse(error, { path: "/api/documents/sync", userId });
  }

  let embeddingIndex = 0;
  const chunkIdsInOrder: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const file of files) {
      await tx.document.deleteMany({
        where: { userId, sourcePath: file.sourcePath },
      });
      const document = await tx.document.create({
        data: {
          title: file.sourcePath,
          content: file.content,
          sourceType: "REPO_FILE",
          sourcePath: file.sourcePath,
          userId,
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
  });

  await Promise.all(
    chunkIdsInOrder.map((id) =>
      setDocumentChunkEmbedding(id, embeddings[embeddingIndex++]),
    ),
  );

  return NextResponse.json({
    syncedDocuments: files.length,
    syncedChunks: allChunkTexts.length,
  });
}
