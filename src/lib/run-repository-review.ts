import type { Octokit } from "octokit";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@/lib/anthropic";
import { getPullRequest, getPullRequestDiff, createPullRequestComment } from "@/lib/github";
import { renderTemplate } from "@/lib/prompt-variables";
import { DEFAULT_MODEL } from "@/lib/models";
import { ReviewOutputSchema } from "@/lib/review-schema";
import { runAiExecution } from "@/lib/run-ai-execution";
import { embedDocuments } from "@/lib/voyage";
import { setReviewCommentEmbedding } from "@/lib/embeddings";
import { logError } from "@/lib/error-log";
import { generateShareToken } from "@/lib/share-token";
import type { ReviewTrigger, ReviewCommentSeverity } from "@/generated/prisma/client";

const SEVERITY_EMOJI: Record<ReviewCommentSeverity, string> = {
  CRITICAL: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
};

// GitHub PRへ投稿するコメント本文(Issue #123)。ai-forgeにログインしなくても
// PR上でレビュー内容を読める・Claude Codeがそのままdiffと一緒に指摘を拾えるように、
// リンクだけでなく指摘本文そのものを埋め込む。詳細画面へのリンクは補足として添える。
function buildReviewCommentBody(
  comments: { filePath: string; line: number | null; severity: ReviewCommentSeverity; body: string }[],
  shareUrl: string | null,
): string {
  const counts: Record<ReviewCommentSeverity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const c of comments) counts[c.severity] += 1;

  const header = `## 🤖 AIレビュー結果 (ai-forge)\n\n${SEVERITY_EMOJI.CRITICAL} CRITICAL ${counts.CRITICAL} 　${SEVERITY_EMOJI.WARNING} WARNING ${counts.WARNING} 　${SEVERITY_EMOJI.INFO} INFO ${counts.INFO}`;

  const body =
    comments.length === 0
      ? "\n\n指摘事項はありませんでした。"
      : comments
          .map((c) => {
            const location = c.line !== null ? `${c.filePath}:${c.line}` : c.filePath;
            return `\n\n### \`${location}\` ${SEVERITY_EMOJI[c.severity]} ${c.severity}\n\n${c.body}`;
          })
          .join("");

  const footer = shareUrl ? `\n\n---\n[ai-forgeで詳細を見る](${shareUrl})` : "";

  return `${header}${body}${footer}`;
}

export type RunRepositoryReviewResult =
  | { status: "SUCCESS"; reviewId: string }
  | { status: "FAILED"; reviewId: string }
  | { status: "FETCH_ERROR"; errorMessage: string };

// Webhook受信時点でReviewをstatus: PENDINGとして先に作っておくための最小限の作成処理
// (Issue #129)。GitHubのWebhookペイロードに含まれるPR情報だけで作成でき、octokit呼び出しは
// 不要。実際のAIレビュー処理はGitHub Actionsのワーカーがこの行をPROCESSINGにclaimしてから
// runRepositoryReview()にexistingReviewIdとして渡す(src/app/api/webhooks/github/[repositoryId]/route.ts、
// src/lib/process-pending-reviews.ts参照)。
export async function createPendingReview({
  repository,
  userId,
  promptVersionId,
  pullRequest,
  triggeredVia,
}: {
  repository: { id: string };
  userId: string;
  promptVersionId: string;
  pullRequest: { number: number; title: string; url: string; headSha: string };
  triggeredVia: ReviewTrigger;
}) {
  return prisma.review.create({
    data: {
      repositoryId: repository.id,
      userId,
      promptVersionId,
      pullRequestNumber: pullRequest.number,
      pullRequestTitle: pullRequest.title,
      pullRequestUrl: pullRequest.url,
      headSha: pullRequest.headSha,
      status: "PENDING",
      triggeredVia,
    },
  });
}

// PR取得→AIレビュー実行→Review/ReviewComment作成→埋め込み生成までの一連の処理。
// 手動実行(POST /api/repositories/:id/reviews)とGitHub Actionsのワーカー
// (src/lib/process-pending-reviews.ts、Issue #129)の両方から呼ばれる共通処理
// (docs/phases/phase2-design.md「Webhook自動レビュー」参照)。呼び出し元は
// レート制限チェック・GitHub連携確認・プロンプト解決を済ませてから呼ぶこと。
//
// existingReviewIdを渡すと、新規にReviewを作る代わりに既存行(createPendingReview()で
// PENDING→ワーカーがPROCESSINGにclaim済みのもの)をSUCCESS/FAILEDに更新する。
// 未指定(手動実行)の場合は従来通り処理完了時にReviewを新規作成する。
export async function runRepositoryReview({
  octokit,
  repository,
  userId,
  promptVersion,
  pullRequestNumber,
  triggeredVia,
  existingReviewId,
}: {
  octokit: Octokit;
  repository: { id: string; owner: string; name: string };
  userId: string;
  promptVersion: { id: string; content: string };
  pullRequestNumber: number;
  triggeredVia: ReviewTrigger;
  existingReviewId?: string;
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
    // PENDING/PROCESSINGのまま放置すると永遠に処理待ちに見えてしまうため、
    // 既存行があればここでFAILEDにしておく。
    if (existingReviewId) {
      await prisma.review.update({
        where: { id: existingReviewId },
        data: { status: "FAILED" },
      });
    }
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
      const response = await anthropic.messages.parse(
        {
          model: DEFAULT_MODEL,
          max_tokens: 16000,
          messages: [{ role: "user", content: renderedContent }],
          output_config: { format: zodOutputFormat(ReviewOutputSchema) },
        },
        // 手動実行(POST /api/repositories/:id/reviews)はVercel Hobbyプランのmax
        // duration(60秒)内に収める必要があり、SDK側のtimeoutでVercelより先に
        // 打ち切ってrunAiExecution()のcatchに乗せ、「無言失敗」ではなく記録の
        // 残るFAILEDにする(実診断で16000トークン出力時に68秒かかるケースを
        // 確認しており、PR取得・埋め込み生成等の前後処理の余白を厚めに取るため
        // 35秒としている)。
        //
        // Webhook自動実行はGitHub Actionsのワーカー(src/lib/process-pending-reviews.ts、
        // Issue #129)から呼ばれる(existingReviewIdが渡る)ため、Vercelの実行時間上限を
        // 受けない。とはいえ無限に待つと1件のハングでワーカーの1回の実行枠を専有して
        // しまうため、安全弁として長めのtimeoutを設定する。
        { timeout: existingReviewId ? 300_000 : 35_000 },
      );

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
      const data = {
        repositoryId: repository.id,
        userId,
        promptVersionId: promptVersion.id,
        executionId: outcome.execution.id,
        pullRequestNumber: pullRequest.number,
        pullRequestTitle: pullRequest.title,
        pullRequestUrl: pullRequest.url,
        headSha: pullRequest.headSha,
        status: "SUCCESS" as const,
        triggeredVia,
      };
      const created = existingReviewId
        ? await tx.review.update({ where: { id: existingReviewId }, data })
        : await tx.review.create({ data });

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

      let comments: {
        id: string;
        body: string;
        filePath: string;
        line: number | null;
        severity: ReviewCommentSeverity;
      }[] = [];
      if (commentData.length > 0) {
        await tx.reviewComment.createMany({ data: commentData });
        comments = await tx.reviewComment.findMany({
          where: { reviewId: created.id },
          select: { id: true, body: true, filePath: true, line: true, severity: true },
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

    // GitHub PRへのコメント投稿(Issue #123)もRAG埋め込みと同様、失敗しても
    // レビュー結果自体は既に作成できているためベストエフォートで行う。
    try {
      const shareToken = generateShareToken();
      await prisma.review.update({
        where: { id: review.review.id },
        data: { shareToken, sharedAt: new Date() },
      });
      const shareUrl = process.env.NEXTAUTH_URL
        ? `${process.env.NEXTAUTH_URL}/share/reviews/${shareToken}`
        : null;

      await createPullRequestComment(
        octokit,
        repository.owner,
        repository.name,
        pullRequestNumber,
        buildReviewCommentBody(review.comments, shareUrl),
      );
    } catch (error) {
      await logError({
        source: "SERVER",
        message: `GitHub PRへのレビューコメント投稿に失敗しました(${repository.owner}/${repository.name}#${pullRequestNumber}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        path: `/api/repositories/${repository.id}/reviews`,
        userId,
      });
    }

    return { status: "SUCCESS", reviewId: review.review.id };
  }

  const failedData = {
    repositoryId: repository.id,
    userId,
    promptVersionId: promptVersion.id,
    executionId: outcome.execution.id,
    pullRequestNumber: pullRequest.number,
    pullRequestTitle: pullRequest.title,
    pullRequestUrl: pullRequest.url,
    headSha: pullRequest.headSha,
    status: "FAILED" as const,
    triggeredVia,
  };
  const review = existingReviewId
    ? await prisma.review.update({ where: { id: existingReviewId }, data: failedData })
    : await prisma.review.create({ data: failedData });

  return { status: "FAILED", reviewId: review.id };
}
