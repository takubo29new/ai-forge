import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { getGitHubClient, getPullRequest, getPullRequestDiff } from "@/lib/github";
import { renderTemplate } from "@/lib/prompt-variables";
import { DEFAULT_MODEL } from "@/lib/models";
import { ReviewOutputSchema } from "@/lib/review-schema";
import { checkExecutionRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { LIST_LIMIT } from "@/lib/list-limits";
import { runAiExecution } from "@/lib/run-ai-execution";
import { embedDocuments } from "@/lib/voyage";
import { setReviewCommentEmbedding } from "@/lib/embeddings";
import { logError } from "@/lib/error-log";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

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
    take: LIST_LIMIT,
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
    return rateLimitResponse(rateLimit.limit);
  }

  const octokit = await getGitHubClient(userId);
  if (!octokit) {
    return NextResponse.json(
      { error: "GitHub連携情報が見つかりません。ログアウトして再度ログインしてください。" },
      { status: 400 },
    );
  }

  let pullRequest;
  let diff: string;
  let diffTruncated: boolean;
  try {
    pullRequest = await getPullRequest(
      octokit,
      repository.owner,
      repository.name,
      pullRequestNumber,
    );
    ({ diff, truncated: diffTruncated } = await getPullRequestDiff(
      octokit,
      repository.owner,
      repository.name,
      pullRequestNumber,
    ));
  } catch {
    return NextResponse.json(
      { error: "PRの取得に失敗しました" },
      { status: 502 },
    );
  }

  const variables = { diff };
  const renderedContent = renderTemplate(promptVersion.content, variables);

  const outcome = await runAiExecution({
    promptVersionId: promptVersion.id,
    userId,
    model: DEFAULT_MODEL,
    variables,
    call: async () => {
      const response = await anthropic.messages.parse({
        model: DEFAULT_MODEL,
        max_tokens: 16000,
        messages: [{ role: "user", content: renderedContent }],
        output_config: { format: zodOutputFormat(ReviewOutputSchema) },
      });

      if (!response.parsed_output) {
        throw new Error("構造化出力の解析に失敗しました");
      }

      return {
        resultText: JSON.stringify(response.parsed_output),
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        result: response.parsed_output,
      };
    },
  });

  if (outcome.status === "SUCCESS") {
    const { findings } = outcome.result;

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          repositoryId: repository.id,
          userId,
          promptVersionId: promptVersion.id,
          executionId: outcome.execution.id,
          pullRequestNumber: pullRequest.number,
          pullRequestTitle: pullRequest.title,
          pullRequestUrl: pullRequest.url,
          headSha: pullRequest.headSha,
          status: "SUCCESS",
        },
      });

      // diffが上限で切り詰められていた場合、その旨をレビュー本文の一部として
      // 残しておく(専用カラムを設けず既存のReviewComment構造で表現する)。
      const commentData = [
        ...(diffTruncated
          ? [
              {
                reviewId: created.id,
                filePath: "(PR diff)",
                line: null,
                severity: "WARNING" as const,
                body: "PRの差分が大きいため、途中で切り詰めてレビューしました。切り詰められた範囲は指摘の対象外です。",
              },
            ]
          : []),
        ...findings.map((f) => ({
          reviewId: created.id,
          filePath: f.filePath,
          line: f.line,
          severity: f.severity,
          body: f.body,
        })),
      ];

      let comments: { id: string; body: string }[] = [];
      if (commentData.length > 0) {
        await tx.reviewComment.createMany({ data: commentData });
        comments = await tx.reviewComment.findMany({
          where: { reviewId: created.id },
          select: { id: true, body: true },
        });
      }

      return { review: created, comments };
    });

    // 指摘の埋め込み生成はRAG検索チャットの検索対象を増やすための副次的な処理であり、
    // ここで失敗してもレビュー結果自体は既に作成・返却できているため、ベストエフォートで
    // 行う(失敗しても200/201のレスポンスやReview自体には影響させない)。埋め込みが
    // 無いままの指摘は/api/review-comments/backfill-embeddingsで後から埋められる。
    if (review.comments.length > 0) {
      try {
        const embeddings = await embedDocuments(
          review.comments.map((c) => c.body),
        );
        await Promise.all(
          review.comments.map((c, i) =>
            setReviewCommentEmbedding(c.id, embeddings[i]),
          ),
        );
      } catch (error) {
        await logError({
          source: "SERVER",
          message: `ReviewCommentの埋め込み生成に失敗しました: ${
            error instanceof Error ? error.message : String(error)
          }`,
          path: `/api/repositories/${repository.id}/reviews`,
          userId,
        });
      }
    }

    return NextResponse.json({ id: review.review.id }, { status: 201 });
  }

  const review = await prisma.review.create({
    data: {
      repositoryId: repository.id,
      userId,
      promptVersionId: promptVersion.id,
      executionId: outcome.execution.id,
      pullRequestNumber: pullRequest.number,
      pullRequestTitle: pullRequest.title,
      pullRequestUrl: pullRequest.url,
      headSha: pullRequest.headSha,
      status: "FAILED",
    },
  });

  return NextResponse.json({ id: review.id }, { status: 200 });
}
