import crypto from "node:crypto";

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
