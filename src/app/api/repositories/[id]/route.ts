import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { deleteGitHubWebhookBestEffort } from "@/lib/github-webhook";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await ctx.params;
  const existing = await prisma.repository.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json(
      { error: "リポジトリが見つかりません" },
      { status: 404 },
    );
  }

  // Webhook自動レビュー(Issue #106)が有効な場合、GitHub側に孤立したWebhookを
  // 残さないよう削除を試みる。失敗してもリポジトリ自体の削除はベストエフォートで続行する。
  if (existing.webhookId) {
    const octokit = await getGitHubClient(userId);
    if (octokit) {
      await deleteGitHubWebhookBestEffort({
        octokit,
        owner: existing.owner,
        repo: existing.name,
        hookId: existing.webhookId,
        userId,
        path: `/api/repositories/${id}`,
      });
    }
  }

  await prisma.repository.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
