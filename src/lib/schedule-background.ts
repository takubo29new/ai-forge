import { after } from "next/server";

// バックグラウンド処理(Phase 5「バックグラウンド処理」)。本番のNext.js
// リクエストスコープ内ではafter()でレスポンス送出後も処理を継続させ、
// 呼び出し元(ルートハンドラ)はtaskの完了を待たずにすぐレスポンスを返せる。
// after()はNextのAsyncLocalStorageベースのリクエストスコープが無いと
// 例外を投げる(統合テストがルートハンドラを直接呼び出す場合など)。その
// 場合はtask()の完了を待ってから返すため、テストはPOST呼び出し後すぐに
// 完了後の状態をアサートできる(モック差し替え不要)。
export async function scheduleBackground(task: () => Promise<void>): Promise<void> {
  try {
    after(task);
  } catch {
    await task();
  }
}
