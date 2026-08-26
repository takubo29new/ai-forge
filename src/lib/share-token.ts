import crypto from "node:crypto";

// レビュー・評価結果を公開共有する際のトークン。IDそのものは推測困難だが
// 用途を分けたくないため専用の高エントロピーな値を別途発行する
// (共有解除→再共有のたびに新しい値になり、古いリンクを無効化できる)。
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
