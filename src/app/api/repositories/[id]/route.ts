import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { logError } from "@/lib/error-log";

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
      try {
        await octokit.rest.repos.deleteWebhook({
          owner: existing.owner,
          repo: existing.name,
          hook_id: existing.webhookId,
        });
      } catch (error) {
        await logError({
          source: "SERVER",
          message: `リポジトリ接続解除時のGitHub Webhook削除に失敗しました(${existing.owner}/${existing.name}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          path: `/api/repositories/${id}`,
          userId,
        });
      }
    }
  }

  await prisma.repository.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
