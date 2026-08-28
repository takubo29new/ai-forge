import crypto from "node:crypto";
import type { Octokit } from "octokit";
import { logError } from "@/lib/error-log";

// Webhook自動レビュー(Issue #106)。リポジトリごとに個別のWebhookをGitHub側に
// 作成するため、secretもリポジトリごとにランダム生成する(GitHubのaccess_tokenと
// 同じsrc/lib/token-crypto.tsのencryptTokenで暗号化して保存する)。
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// X-Hub-Signature-256ヘッダー(`sha256=<hex>`)を生のリクエストボディに対する
// HMAC-SHA256で検証する。タイミング攻撃を避けるためcrypto.timingSafeEqualで
// 比較する(文字列の===比較は先頭からの不一致箇所で早期リターンし得るため)。
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// GitHub側のWebhook削除はベストエフォート(孤立したWebhookが残ってもGitHub側で
// 無害)。リポジトリ接続解除(DELETE /api/repositories/:id)・Webhook無効化
// (DELETE /api/repositories/:id/webhook)・DB更新失敗時のロールバック
// (POST /api/repositories/:id/webhook)の3箇所から呼ぶ共通処理。
export async function deleteGitHubWebhookBestEffort({
  octokit,
  owner,
  repo,
  hookId,
  userId,
  path,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  hookId: number;
  userId: string;
  path: string;
}): Promise<void> {
  try {
    await octokit.rest.repos.deleteWebhook({ owner, repo, hook_id: hookId });
  } catch (error) {
    await logError({
      source: "SERVER",
      message: `GitHub Webhookの削除に失敗しました(${owner}/${repo}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      path,
      userId,
    });
  }
}
