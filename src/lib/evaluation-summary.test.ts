import { beforeEach, describe, expect, it } from "vitest";
import { encryptField } from "./field-crypto";
import { resolveEvaluationSummary } from "./evaluation-summary";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-vitest";
});

describe("resolveEvaluationSummary", () => {
  it("Evaluation.summaryがあれば復号して返す", () => {
    const summary = resolveEvaluationSummary({
      summary: encryptField("彩り豊かで美味しそうです"),
      execution: null,
    });
    expect(summary).toBe("彩り豊かで美味しそうです");
  });

  it("summaryが無い場合、旧仕様のExecution.resultText(JSON)から再構築する", () => {
    const summary = resolveEvaluationSummary({
      summary: null,
      execution: {
        resultText: JSON.stringify({ summary: "旧形式の総評", findings: [] }),
      },
    });
    expect(summary).toBe("旧形式の総評");
  });

  it("summaryも旧resultTextも無ければnullを返す", () => {
    const summary = resolveEvaluationSummary({ summary: null, execution: null });
    expect(summary).toBeNull();
  });

  it("resultTextが想定外の形式(プレースホルダー等)でもエラーにならずnullを返す", () => {
    const summary = resolveEvaluationSummary({
      summary: null,
      execution: { resultText: "(AI評価の結果は暗号化して...)" },
    });
    expect(summary).toBeNull();
  });
});
