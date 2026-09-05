// バッチAI評価(Issue #108)で1回に送信できるファイル数の上限。
// クライアント(evaluation-manager.tsx)とサーバー(POST /api/evaluations/batches)の
// 双方で同じ値を使うため、ここに集約する。
export const MAX_BATCH_SIZE = 10;
