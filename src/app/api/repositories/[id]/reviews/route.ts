import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { getGitHubClient, getPullRequest, getPullRequestDiff } from "@/lib/github";
import { renderTemplate } from "@/lib/prompt-variables";
import { DEFAULT_MODEL } from "@/lib/models";
import { ReviewOutputSchema } from "@/lib/review-schema";
import { checkExecutionRateLimit } from "@/lib/rate-limit";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/repositories/[id]/reviews">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository || repository.userId !== session.user.id) {
    return NextResponse.json(
      { error: "リポジトリが見つかりません" },
      { status: 404 },
    );
  }

  const reviews = await prisma.review.findMany({
    where: { repositoryId: id },
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(reviews);
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/repositories/[id]/reviews">,
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
  const pullRequestNumber =
    typeof body.pullRequestNumber === "number" ? body.pullRequestNumber : null;
  const promptId = typeof body.promptId === "string" ? body.promptId : null;

  if (!pullRequestNumber || !promptId) {
    return NextResponse.json(
      { error: "PRとプロンプトを指定してください" },
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

  const rateLimit = await checkExecutionRateLimit(userId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `実行回数の上限(1時間あたり${rateLimit.limit}回)に達しました。しばらくしてから再度お試しください。`,
      },
      { status: 429 },
    );
  }

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  let pullRequest;
  let diff;
  try {
    pullRequest = await getPullRequest(
      octokit,
      repository.owner,
      repository.name,
      pullRequestNumber,
    );
    diff = await getPullRequestDiff(
      octokit,
      repository.owner,
      repository.name,
      pullRequestNumber,
    );
  } catch {
    return NextResponse.json(
      { error: "PRの取得に失敗しました" },
      { status: 502 },
    );
  }

  const variables = { diff };
  const renderedContent = renderTemplate(promptVersion.content, variables);
  const startedAt = Date.now();

  try {
    const response = await anthropic.messages.parse({
      model: DEFAULT_MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content: renderedContent }],
      output_config: { format: zodOutputFormat(ReviewOutputSchema) },
    });
    const durationMs = Date.now() - startedAt;

    if (!response.parsed_output) {
      throw new Error("構造化出力の解析に失敗しました");
    }
    const { findings } = response.parsed_output;

    const review = await prisma.$transaction(async (tx) => {
      const execution = await tx.execution.create({
        data: {
          promptVersionId: promptVersion.id,
          userId,
          model: DEFAULT_MODEL,
          variables,
          resultText: JSON.stringify(response.parsed_output),
          status: "SUCCESS",
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          durationMs,
        },
      });

      const created = await tx.review.create({
        data: {
          repositoryId: repository.id,
          userId,
          promptVersionId: promptVersion.id,
          executionId: execution.id,
          pullRequestNumber: pullRequest.number,
          pullRequestTitle: pullRequest.title,
          pullRequestUrl: pullRequest.url,
          headSha: pullRequest.headSha,
          status: "SUCCESS",
        },
      });

      if (findings.length > 0) {
        await tx.reviewComment.createMany({
          data: findings.map((f) => ({
            reviewId: created.id,
            filePath: f.filePath,
            line: f.line,
            severity: f.severity,
            body: f.body,
          })),
        });
      }

      return created;
    });

    return NextResponse.json({ id: review.id }, { status: 201 });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMessage =
      error instanceof Anthropic.APIError
        ? `${error.status ?? ""} ${error.message}`.trim()
        : error instanceof Error
          ? error.message
          : "レビュー実行中にエラーが発生しました";

    const review = await prisma.$transaction(async (tx) => {
      const execution = await tx.execution.create({
        data: {
          promptVersionId: promptVersion.id,
          userId,
          model: DEFAULT_MODEL,
          variables,
          status: "FAILED",
          errorMessage,
          durationMs,
        },
      });

      return tx.review.create({
        data: {
          repositoryId: repository.id,
          userId,
          promptVersionId: promptVersion.id,
          executionId: execution.id,
          pullRequestNumber: pullRequest.number,
          pullRequestTitle: pullRequest.title,
          pullRequestUrl: pullRequest.url,
          headSha: pullRequest.headSha,
          status: "FAILED",
        },
      });
    });

    return NextResponse.json({ id: review.id }, { status: 201 });
  }
}
