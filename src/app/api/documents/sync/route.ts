import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prepareSyncFiles, writeSyncedDocuments } from "@/lib/document-sync";
import { embedDocuments } from "@/lib/voyage";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

// あわせてVercelの関数自体の実行時間上限も引き上げる(ファイル読み込み
// →Voyage AI呼び出し→DB書き込みトランザクション、を1リクエストで行うため)。
export const maxDuration = 60;

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
// docs/phases/phase3-design.md参照)。repositoryIdはnull(ai-forge自身の同期であることを
// 表す)で、接続済みリポジトリの同期は/api/repositories/:id/documents/syncが担う
// (docs/phases/phase4-design.md「2. プロジェクト単位のドキュメント管理」参照)。
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
  const targetContents = await Promise.all(
    targets.map(async (target) => ({
      sourcePath: target.sourcePath,
      content: await readFile(target.fullPath, "utf-8"),
    })),
  );

  const { files, allChunkTexts } = prepareSyncFiles(targetContents);
  if (allChunkTexts.length === 0) {
    return NextResponse.json({ syncedDocuments: 0, syncedChunks: 0 });
  }

  let embeddings: number[][];
  try {
    embeddings = await embedDocuments(allChunkTexts);
  } catch (error) {
    return voyageErrorResponse(error, { path: "/api/documents/sync", userId });
  }

  const result = await writeSyncedDocuments(userId, null, files, embeddings);
  return NextResponse.json(result);
}
