import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  const prompt = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.prompt.update({ where: { id }, data });
    }

    if (content !== undefined) {
      const latest = await tx.promptVersion.findFirst({
        where: { promptId: id },
        orderBy: { versionNumber: "desc" },
      });
      await tx.promptVersion.create({
        data: {
          promptId: id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          content,
          note,
        },
      });
    }

    return tx.prompt.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    });
  });

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
