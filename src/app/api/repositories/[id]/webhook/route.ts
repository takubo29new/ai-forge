import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGitHubClient } from "@/lib/github";
import { generateWebhookSecret, deleteGitHubWebhookBestEffort } from "@/lib/github-webhook";
import { encryptToken } from "@/lib/token-crypto";
import { logError } from "@/lib/error-log";

// Webhook自動レビュー(Issue #106)の有効化・デフォルトプロンプト変更。
// アプリ全体で1つのWebhookではなく、リポジトリごとに個別のWebhookをGitHub側に
// 作成する方式(docs/phases/phase2-design.md「Webhook自動レビュー」参照)。
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/repositories/[id]/webhook">,
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

  const body = await request.json();
  const promptId = typeof body.promptId === "string" ? body.promptId : null;
  if (!promptId) {
    return NextResponse.json(
      { error: "プロンプトを指定してください" },
      { status: 400 },
    );
  }

  const promptVersion = await prisma.promptVersion.findFirst({
    where: { prompt: { id: promptId, userId } },
    orderBy: { versionNumber: "desc" },
  });
  if (!promptVersion) {
    return NextResponse.json(
      { error: "プロンプトが見つかりません" },
      { status: 400 },
    );
  }
  if (!promptVersion.content.includes("{{diff}}")) {
    return NextResponse.json(
      {
        error:
          "選択したプロンプトの本文に{{diff}}が含まれていないため、コード差分を渡せません。プロンプトを編集して{{diff}}を追加してください。",
      },
      { status: 400 },
    );
  }

  // 既にWebhookを作成済みなら、GitHub側は変更せずデフォルトプロンプトだけ更新する
  // (secret・宛先URLは変わらないため再作成は不要)。
  if (repository.webhookEnabled && repository.webhookId) {
    await prisma.repository.update({
      where: { id },
      data: { defaultPromptId: promptId },
    });
    return NextResponse.json({ webhookEnabled: true });
  }

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  const publicUrl = process.env.NEXTAUTH_URL;
  if (!publicUrl) {
    return NextResponse.json(
      { error: "NEXTAUTH_URLが設定されていないため、Webhookの宛先URLを組み立てられません" },
      { status: 500 },
    );
  }

  const secret = generateWebhookSecret();
  let hookId: number;
  try {
    const { data } = await octokit.rest.repos.createWebhook({
      owner: repository.owner,
      repo: repository.name,
      config: {
        url: `${publicUrl}/api/webhooks/github/${repository.id}`,
        content_type: "json",
        secret,
        insecure_ssl: "0",
      },
      events: ["pull_request"],
      active: true,
    });
    hookId = data.id;
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `GitHub Webhookの作成に失敗しました(${repository.owner}/${repository.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/repositories/${repository.id}/webhook`,
      userId,
    });
    return NextResponse.json(
      { error: "GitHub側でのWebhook作成に失敗しました。リポジトリの管理者権限があるか確認してください。" },
      { status: 502 },
    );
  }

  try {
    await prisma.repository.update({
      where: { id },
      data: {
        webhookEnabled: true,
        webhookId: hookId,
        webhookSecret: encryptToken(secret),
        defaultPromptId: promptId,
      },
    });
  } catch (error) {
    // GitHub側の作成は既に成功しているため、DB保存に失敗したまま放置すると
    // secretがどこにも残らない孤立したWebhookになり、かつ「有効化」の再試行が
    // 新しいWebhookをもう1つ作ってしまう(DB上はwebhookEnabled=falseのまま
    // なので既存判定に引っかからない)。作成直後のWebhookを削除して
    // ロールバックしてから、呼び出し元にエラーを伝える。
    await deleteGitHubWebhookBestEffort({
      octokit,
      owner: repository.owner,
      repo: repository.name,
      hookId,
      userId,
      path: `/api/repositories/${repository.id}/webhook`,
    });
    await logError({
      source: "SERVER",
      message: `Webhook設定のDB保存に失敗しました(${repository.owner}/${repository.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/repositories/${repository.id}/webhook`,
      userId,
    });
    return NextResponse.json(
      { error: "Webhookの設定保存に失敗しました。もう一度お試しください。" },
      { status: 500 },
    );
  }

  return NextResponse.json({ webhookEnabled: true });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]/webhook">,
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

  if (repository.webhookId) {
    const octokit = await getGitHubClient(userId);
    if (octokit) {
      await deleteGitHubWebhookBestEffort({
        octokit,
        owner: repository.owner,
        repo: repository.name,
        hookId: repository.webhookId,
        userId,
        path: `/api/repositories/${repository.id}/webhook`,
      });
    }
  }

  await prisma.repository.update({
    where: { id },
    data: {
      webhookEnabled: false,
      webhookId: null,
      webhookSecret: null,
      defaultPromptId: null,
    },
  });

  return new NextResponse(null, { status: 204 });
}
