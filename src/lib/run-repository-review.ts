import type { Octokit } from "octokit";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { getPullRequest, getPullRequestDiff } from "@/lib/github";
import { renderTemplate } from "@/lib/prompt-variables";
import { DEFAULT_MODEL } from "@/lib/models";
import { ReviewOutputSchema } from "@/lib/review-schema";
import { runAiExecution } from "@/lib/run-ai-execution";
import { embedDocuments } from "@/lib/voyage";
import { setReviewCommentEmbedding } from "@/lib/embeddings";
import { logError } from "@/lib/error-log";
import type { ReviewTrigger } from "@/generated/prisma/client";

export type RunRepositoryReviewResult =
  | { status: "SUCCESS"; reviewId: string }
  | { status: "FAILED"; reviewId: string }
  | { status: "FETCH_ERROR"; errorMessage: string };

// PR取得→AIレビュー実行→Review/ReviewComment作成→埋め込み生成までの一連の処理。
// 手動実行(POST /api/repositories/:id/reviews)とWebhook自動実行
// (POST /api/webhooks/github/:repositoryId)の両方から呼ばれる共通処理
// (docs/phases/phase2-design.md「Webhook自動レビュー」参照)。呼び出し元は
// レート制限チェック・GitHub連携確認・プロンプト解決を済ませてから呼ぶこと。
export async function runRepositoryReview({
  octokit,
  repository,
  userId,
  promptVersion,
  pullRequestNumber,
  triggeredVia,
}: {
  octokit: Octokit;
  repository: { id: string; owner: string; name: string };
  userId: string;
  promptVersion: { id: string; content: string };
  pullRequestNumber: number;
  triggeredVia: ReviewTrigger;
}): Promise<RunRepositoryReviewResult> {
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
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `PR#${pullRequestNumber}の取得に失敗しました(${repository.owner}/${repository.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path: `/api/repositories/${repository.id}/reviews`,
      userId,
    });
    return { status: "FETCH_ERROR", errorMessage: "PRの取得に失敗しました" };
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
        // Webhook自動実行はVercel Hobbyプランのmax duration(60秒)内に収める必要があり、
        // max_tokensが大きいほど生成時間が延びタイムアウトで無言失敗するリスクが上がる
        // (Issue #106運用開始直後、実診断で16000設定時に68秒かかるケースを確認した)。
        max_tokens: 8000,
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
          triggeredVia,
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
    // ここで失敗してもレビュー結果自体は既に作成できているため、ベストエフォートで行う。
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

    return { status: "SUCCESS", reviewId: review.review.id };
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
      triggeredVia,
    },
  });

  return { status: "FAILED", reviewId: review.id };
}
