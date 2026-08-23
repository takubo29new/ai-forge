import { describe, expect, it } from "vitest";
import { ReviewOutputSchema } from "./review-schema";

describe("ReviewOutputSchema", () => {
  it("accepts a well-formed findings array", () => {
    const result = ReviewOutputSchema.safeParse({
      findings: [
        { filePath: "src/foo.ts", line: 10, severity: "WARNING", body: "..." },
        { filePath: "src/bar.ts", line: null, severity: "INFO", body: "..." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty findings array (no issues found)", () => {
    const result = ReviewOutputSchema.safeParse({ findings: [] });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid severity value", () => {
    const result = ReviewOutputSchema.safeParse({
      findings: [
        { filePath: "src/foo.ts", line: 1, severity: "URGENT", body: "..." },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing filePath", () => {
    const result = ReviewOutputSchema.safeParse({
      findings: [{ line: 1, severity: "INFO", body: "..." }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer line number", () => {
    const result = ReviewOutputSchema.safeParse({
      findings: [
        { filePath: "src/foo.ts", line: 1.5, severity: "INFO", body: "..." },
      ],
    });
    expect(result.success).toBe(false);
  });
});
