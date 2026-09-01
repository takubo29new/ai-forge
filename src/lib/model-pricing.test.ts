import { describe, expect, it } from "vitest";
import { estimateCostUsd, formatUsd, MODEL_PRICING } from "./model-pricing";
import { AVAILABLE_MODELS } from "./models";

describe("estimateCostUsd", () => {
  it("既知のモデルは入出力トークン数から金額を計算する", () => {
    // claude-opus-5: $5/1M入力, $25/1M出力
    expect(estimateCostUsd("claude-opus-5", 1_000_000, 1_000_000)).toBe(30);
    expect(estimateCostUsd("claude-opus-5", 0, 0)).toBe(0);
  });

  it("未知のモデルはnullを返す(0円と混同させない)", () => {
    expect(estimateCostUsd("claude-unknown-model", 1000, 1000)).toBeNull();
  });

  it("AVAILABLE_MODELSの全モデルが料金テーブルに存在する", () => {
    for (const { id } of AVAILABLE_MODELS) {
      expect(MODEL_PRICING[id]).toBeDefined();
    }
  });
});

describe("formatUsd", () => {
  it("小数点2桁のドル表記にする", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });
});
