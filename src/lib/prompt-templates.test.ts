import { describe, expect, it } from "vitest";
import { PROMPT_TEMPLATES } from "./prompt-templates";

describe("PROMPT_TEMPLATES", () => {
  it("idが重複しない", () => {
    const ids = PROMPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("タイトル・本文が空でない", () => {
    for (const t of PROMPT_TEMPLATES) {
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("TEXT用テンプレートは{{変数名}}を含む", () => {
    for (const t of PROMPT_TEMPLATES.filter((t) => t.inputTypeHint === "TEXT")) {
      expect(t.content).toMatch(/\{\{\w+\}\}/);
    }
  });
});
