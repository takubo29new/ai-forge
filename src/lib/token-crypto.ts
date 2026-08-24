import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = "enc:v1:";

// TOKEN_ENCRYPTION_KEYは任意長の文字列として受け取り、SHA-256でAES-256に
// 必要な32バイト鍵に変換する(openssl rand等で生成した高エントロピーな
// 文字列であれば、ハッシュ化しても実質的な強度は落ちない)。
function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("TOKEN_ENCRYPTION_KEYが設定されていません");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function isEncryptedToken(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

// GitHubのaccess_token/refresh_tokenをDBに平文で残さないための暗号化。
// iv(12B) + authTag(16B) + 暗号文を連結してbase64化し、先頭に判別用の
// プレフィックスを付ける(decryptTokenが暗号化済みかどうかを判定するため)。
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return (
    ENCRYPTED_PREFIX +
    Buffer.concat([iv, authTag, ciphertext]).toString("base64")
  );
}

// プレフィックスが無い値は暗号化導入前に平文で保存された既存データとみなし、
// そのまま返す(呼び出し元でこれを検知して再保存し、次回以降は暗号化された
// 状態に移行させる)。
export function decryptToken(value: string): string {
  if (!isEncryptedToken(value)) return value;

  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
