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
