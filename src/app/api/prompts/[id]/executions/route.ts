import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/prompts/[id]/executions">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const prompt = await prisma.prompt.findUnique({ where: { id } });
  if (!prompt || prompt.userId !== session.user.id) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 404 },
    );
  }

  const executions = await prisma.execution.findMany({
    where: { promptVersion: { promptId: id } },
    include: { promptVersion: { select: { versionNumber: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(executions);
}
