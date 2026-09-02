// Anthropic公式の現行料金($/1Mトークン、確認日: 2026-06-24)。モデル追加・料金改定
// 時にここだけ更新すればよいよう一元化する(Issue #109)。あくまで概算であり、
// プロンプトキャッシュ・バッチAPIの割引等は考慮しないため実際の請求額とは
// 一致しない(/usageページにもその旨を明記する)。
export const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-sonnet-5": { inputPerMillion: 2, outputPerMillion: 10 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
};

// 料金テーブルに無いモデル(過去に使われていたが現在は選択肢に無いモデル等)は
// nullを返し、呼び出し側で「概算に含まれない」ことを明示できるようにする
// (0円と表示すると実際は課金されているのに無料だったかのように誤解を招くため)。
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (
    (promptTokens / 1_000_000) * pricing.inputPerMillion +
    (completionTokens / 1_000_000) * pricing.outputPerMillion
  );
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
