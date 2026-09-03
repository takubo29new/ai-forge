import type { Octokit } from "octokit";
import { logError } from "@/lib/error-log";

// GitHub Actionsのscheduleトリガー(process-pending-reviews.yml、5分間隔)は実行
// タイミングが保証されず、実際には数十分〜数時間遅延することがある。Webhook受信・
// 手動レビュー要求のたびにこの関数でworkflow_dispatchを直接叩き、その場でワーカーを
// 起動することで遅延を回避する。scheduleは、このdispatch呼び出し自体が失敗した場合の
// 保険としてのみ残す(間隔を伸ばしてよい)。
//
// ai-forgeリポジトリ自身のActionsを起動するにはそのリポジトリへの書き込み権限を持つ
// トークンが要る。呼び出し元が渡すoctokitはレビュー対象リポジトリの所有者(GitHub
// ユーザー)のOAuthトークン(scope: repo)で、対象がai-forgeリポジトリ自身の所有者と
// 同じ場合はそのまま使える。異なる場合は403/404で失敗するが、ベストエフォートの
// 起動処理なので握りつぶしてscheduleでの回収に委ねる。
const GITHUB_ACTIONS_OWNER = process.env.GITHUB_ACTIONS_OWNER;
const GITHUB_ACTIONS_REPO = process.env.GITHUB_ACTIONS_REPO;

export async function triggerReviewWorker(
  octokit: Octokit,
  userId?: string,
): Promise<void> {
  if (!GITHUB_ACTIONS_OWNER || !GITHUB_ACTIONS_REPO) return;

  try {
    await octokit.rest.actions.createWorkflowDispatch({
      owner: GITHUB_ACTIONS_OWNER,
      repo: GITHUB_ACTIONS_REPO,
      workflow_id: "process-pending-reviews.yml",
      ref: "main",
    });
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `レビューワーカーの即時起動に失敗しました(scheduleでの処理を待ちます): ${
        error instanceof Error ? error.message : String(error)
      }`,
      userId: userId ?? null,
    });
  }
}
