import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { chunkMarkdown } from "@/lib/document-chunks";
import { embedDocuments } from "@/lib/voyage";
import { setDocumentChunkEmbedding } from "@/lib/embeddings";
import { checkDocumentRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { voyageErrorResponse } from "@/lib/voyage-error-response";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const documents = await prisma.document.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { chunks: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return NextResponse.json(documents);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";

  if (!title || !content.trim()) {
    return NextResponse.json(
      { error: "タイトルと本文を入力してください" },
      { status: 400 },
    );
  }

  const rateLimit = await checkDocumentRateLimit(userId);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.limit);
  }

  const chunkContents = chunkMarkdown(content);
  if (chunkContents.length === 0) {
    return NextResponse.json(
      { error: "本文からチャンクを作成できませんでした" },
      { status: 400 },
    );
  }

  const document = await prisma.document.create({
    data: {
      title,
      content,
      sourceType: "MANUAL",
      userId,
      chunks: {
        create: chunkContents.map((chunkContent, chunkIndex) => ({
          chunkIndex,
          content: chunkContent,
        })),
      },
    },
    include: { chunks: true },
  });

  try {
    const embeddings = await embedDocuments(chunkContents);
    await Promise.all(
      document.chunks.map((chunk, i) =>
        setDocumentChunkEmbedding(chunk.id, embeddings[i]),
      ),
    );
  } catch (error) {
    // 埋め込みが無いDocumentを検索対象外のまま残すと気づきにくいため、
    // 埋め込み生成に失敗した場合はDocument自体を作り直せる状態に戻す。
    await prisma.document.delete({ where: { id: document.id } });
    return voyageErrorResponse(error, { path: "/api/documents", userId });
  }

  return NextResponse.json(
    { id: document.id, title: document.title, chunkCount: document.chunks.length },
    { status: 201 },
  );
}
