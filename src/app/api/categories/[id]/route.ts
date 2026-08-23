import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/categories/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "カテゴリが見つかりません" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  if (!name) {
    return NextResponse.json(
      { error: "カテゴリ名を入力してください" },
      { status: 400 },
    );
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name, description: description || null },
      include: { _count: { select: { prompts: true } } },
    });
    return NextResponse.json(category);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "同じ名前のカテゴリが既に存在します" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/categories/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "カテゴリが見つかりません" },
      { status: 404 },
    );
  }

  await prisma.category.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
