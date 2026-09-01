// サーバーコンポーネントはVercel上(UTC)で実行されるため、timeZoneを明示しないと
// toLocaleString("ja-JP")は書式だけ日本語でタイムゾーンはUTCのままになる。
// このアプリの利用者は日本語ユーザー前提のため、常にAsia/Tokyoで表示する。
export function formatDateTimeJST(date: Date | string): string {
  return new Date(date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
