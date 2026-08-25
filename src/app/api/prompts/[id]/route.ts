import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { embedDocuments } from "@/lib/voyage";
import { setPromptVersionEmbedding } from "@/lib/embeddings";
import { logError } from "@/lib/error-log";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/prompts/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const prompt = await prisma.prompt.findUnique({
    where: { id },
    include: {
      category: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!prompt || prompt.userId !== session.user.id) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  return NextResponse.json(prompt);
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/prompts/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.prompt.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  const body = await request.json();

  const data: { title?: string; categoryId?: string | null } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json(
        { error: "タイトルを入力してください" },
        { status: 400 },
      );
    }
    data.title = title;
  }

  if ("categoryId" in body) {
    const categoryId =
      typeof body.categoryId === "string" && body.categoryId
        ? body.categoryId
        : null;
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category || category.userId !== session.user.id) {
        return NextResponse.json(
          { error: "カテゴリが見つかりません" },
          { status: 400 },
        );
      }
    }
    data.categoryId = categoryId;
  }

  const content = typeof body.content === "string" ? body.content : undefined;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (content !== undefined && !content.trim()) {
    return NextResponse.json(
      { error: "本文を入力してください" },
      { status: 400 },
    );
  }

  let createdVersionId: string | undefined;

  const prompt = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.prompt.update({ where: { id }, data });
    }

    if (content !== undefined) {
      const latest = await tx.promptVersion.findFirst({
        where: { promptId: id },
        orderBy: { versionNumber: "desc" },
      });
      const created = await tx.promptVersion.create({
        data: {
          promptId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          content,
          note,
        },
      });
      createdVersionId = created.id;
    }

    return tx.prompt.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });
  });

  // 新バージョンの埋め込み生成はRAG検索チャットの検索対象を増やすための副次的な処理であり、
  // 失敗してもプロンプト保存自体は既に成功しているため、ベストエフォートで行う
  // (ReviewCommentの埋め込み生成と同じ方針。docs/db-design.md参照)。埋め込みが無い
  // バージョンは/api/prompt-versions/backfill-embeddingsで後から埋められる。
  if (createdVersionId !== undefined && content !== undefined) {
    try {
      const [embedding] = await embedDocuments([content]);
      await setPromptVersionEmbedding(createdVersionId, embedding);
    } catch (error) {
      await logError({
        source: "SERVER",
        message: `PromptVersionの埋め込み生成に失敗しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
        path: `/api/prompts/${id}`,
        userId: session.user.id,
      });
    }
  }

  return NextResponse.json(prompt);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/prompts/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.prompt.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  await prisma.prompt.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
