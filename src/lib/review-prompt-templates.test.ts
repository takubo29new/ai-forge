import { describe, expect, it } from "vitest";
import { REVIEW_PROMPT_TEMPLATES } from "./review-prompt-templates";

describe("REVIEW_PROMPT_TEMPLATES", () => {
  it("idが重複しない", () => {
    const ids = REVIEW_PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("タイトル・本文が空でない", () => {
    for (const t of REVIEW_PROMPT_TEMPLATES) {
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("すべて{{diff}}を含む(Webhook自動レビューのデフォルトプロンプトに設定できる必要がある)", () => {
    for (const t of REVIEW_PROMPT_TEMPLATES) {
      expect(t.content).toContain("{{diff}}");
    }
  });

  it("1件以上ある", () => {
    expect(REVIEW_PROMPT_TEMPLATES.length).toBeGreaterThan(0);
  });
});
