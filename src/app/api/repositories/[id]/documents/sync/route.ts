import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient, fetchRepositoryMarkdownFiles } from "@/lib/github";
import { prepareSyncFiles, writeSyncedDocuments } from "@/lib/document-sync";
import { embedDocuments } from "@/lib/voyage";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { voyageErrorResponse } from "@/lib/voyage-error-response";
import { logError } from "@/lib/error-log";

// GitHub APIでのファイル取得(ディレクトリ一覧+各ファイル)とVoyage AI呼び出し・
// DB書き込みを1リクエストで行うため、/api/documents/syncと同様に上限を引き上げる
export const maxDuration = 60;

// 接続済みリポジトリのdocs/配下・README.mdを取り込む(docs/phases/phase4-design.md
// 「2. プロジェクト単位のドキュメント管理」参照)。/api/documents/syncと
// 同じ「同じsourcePathのDocumentを丸ごと作り直す」方式だが、対象を
// このリポジトリ(repositoryId)のDocumentに限定する
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]/documents/sync">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await ctx.params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== userId) {
    return NextResponse.json(
      { error: "リポジトリが見つかりません" },
      { status: 404 },
    );
  }

  const rateLimit = await checkDocumentRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  let targetContents;
  try {
    targetContents = await fetchRepositoryMarkdownFiles(
      octokit,
      repository.owner,
      repository.name,
      repository.defaultBranch ?? undefined,
    );
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `リポジトリのファイル取得に失敗しました(${repository.owner}/${repository.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/repositories/${repository.id}/documents/sync`,
      userId,
    });
    return NextResponse.json(
      { error: "リポジトリのファイル取得に失敗しました" },
      { status: 502 },
    );
  }

  const { files, allChunkTexts } = prepareSyncFiles(targetContents);
  if (allChunkTexts.length === 0) {
    return NextResponse.json({ syncedDocuments: 0, syncedChunks: 0 });
  }

  let embeddings: number[][];
  try {
    embeddings = await embedDocuments(allChunkTexts);
  } catch (error) {
    return voyageErrorResponse(error, {
      path: `/api/repositories/${repository.id}/documents/sync`,
      userId,
    });
  }

  const result = await writeSyncedDocuments(userId, repository.id, files, embeddings);
  return NextResponse.json(result);
}
