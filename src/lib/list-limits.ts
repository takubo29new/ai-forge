// 一覧系クエリの上限件数。ページネーションUIを設けるほどの規模ではないため、
// 無制限取得による劣化を防ぐための単純な上限としてまず導入する。
export const LIST_LIMIT = 100;

// ユーザーが選べる表示件数(エラーログ・実行履歴・バージョン履歴・レビュー履歴など)。
// LIST_LIMITを超える値は指定できないようにする。
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function parsePageSize(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])) {
    return DEFAULT_PAGE_SIZE;
  }
  return parsed;
}
