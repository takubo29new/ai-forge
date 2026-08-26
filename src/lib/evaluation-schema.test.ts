import { describe, expect, it } from "vitest";
import { EvaluationOutputSchema } from "./evaluation-schema";

describe("EvaluationOutputSchema", () => {
  it("accepts a well-formed findings array with a summary", () => {
    const result = EvaluationOutputSchema.safeParse({
      summary: "彩り豊かで美味しそうです",
      findings: [
        { label: "彩り", tone: "POSITIVE", score: 90, body: "..." },
        { label: "栄養バランス", tone: "SUGGESTION", score: null, body: "..." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty findings array", () => {
    const result = EvaluationOutputSchema.safeParse({
      summary: "特にコメントはありません",
      findings: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid tone value", () => {
    const result = EvaluationOutputSchema.safeParse({
      summary: "...",
      findings: [{ label: "彩り", tone: "GOOD", score: 90, body: "..." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing label", () => {
    const result = EvaluationOutputSchema.safeParse({
      summary: "...",
      findings: [{ tone: "POSITIVE", score: 90, body: "..." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a score outside 0-100", () => {
    const result = EvaluationOutputSchema.safeParse({
      summary: "...",
      findings: [{ label: "彩り", tone: "POSITIVE", score: 150, body: "..." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing summary", () => {
    const result = EvaluationOutputSchema.safeParse({
      findings: [],
    });
    expect(result.success).toBe(false);
  });
});
