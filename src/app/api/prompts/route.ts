import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();

  const prompts = await prisma.prompt.findMany({
    where: {
      userId: session.user.id,
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      category: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(prompts);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  const categoryId =
    typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;

  if (!title) {
    return NextResponse.json(
      { error: "タイトルを入力してください" },
      { status: 400 },
    );
  }
  if (!content.trim()) {
    return NextResponse.json(
      { error: "本文を入力してください" },
      { status: 400 },
    );
  }

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

  const prompt = await prisma.prompt.create({
    data: {
      title,
      categoryId,
      userId: session.user.id,
      versions: { create: { versionNumber: 1, content } },
    },
    include: {
      category: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(prompt, { status: 201 });
}
