// AI評価結果(Evaluation.summary / EvaluationFinding.body)のようなDB上の
// 機微なテキストを暗号化するための薄いラッパー。実体はGitHubトークンの暗号化
// (src/lib/token-crypto.ts)と同じAES-256-GCMの仕組みを再利用する。プレフィックス
// による判別(isEncryptedToken)のおかげで、この機能を導入する前に作成された
// 平文データも復号時にそのまま読める(GitHubトークンと同じ後方互換の考え方)。
export {
  encryptToken as encryptField,
  decryptToken as decryptField,
  isEncryptedToken,
} from "./token-crypto";

import { decryptToken } from "./token-crypto";

// TOKEN_ENCRYPTION_KEYのローテーション等で復号に失敗しうる(AES-GCMの認証タグ
// 検証エラーは例外を投げる)。評価結果の表示(一覧・詳細・共有ページ)は
// サーバーコンポーネント内で直接呼ぶため、ここで捕まえないとページ全体が
// 500になる。共有ページは非ログインの第三者にも公開されるため特に影響が大きい。
export function decryptFieldSafe(value: string): string {
  try {
    return decryptToken(value);
  } catch {
    return "(暗号化キーのローテーションにより表示できません)";
  }
}
