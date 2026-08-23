import { describe, expect, it } from "vitest";
import { extractVariableNames, renderTemplate } from "./prompt-variables";

describe("extractVariableNames", () => {
  it("extracts variable names from {{name}} placeholders", () => {
    const content = "こんにちは {{name}} さん、{{topic}} について教えてください。";
    expect(extractVariableNames(content)).toEqual(["name", "topic"]);
  });

  it("deduplicates repeated variables", () => {
    const content = "{{word}}と{{word}}を比較してください。";
    expect(extractVariableNames(content)).toEqual(["word"]);
  });

  it("returns an empty array when there are no variables", () => {
    expect(extractVariableNames("プレーンな本文です。")).toEqual([]);
  });

  it("ignores malformed placeholders", () => {
    expect(extractVariableNames("{{}} {{ }} {word}")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitutes provided variables", () => {
    const content = "{{greeting}}, {{name}}!";
    expect(renderTemplate(content, { greeting: "Hello", name: "World" })).toBe(
      "Hello, World!",
    );
  });

  it("keeps the placeholder when a variable value is missing", () => {
    const content = "{{a}} and {{b}}";
    expect(renderTemplate(content, { a: "1" })).toBe("1 and {{b}}");
  });

  it("returns the content unchanged when it has no placeholders", () => {
    expect(renderTemplate("plain text", { unused: "x" })).toBe("plain text");
  });

  it("allows an empty string as a valid variable value", () => {
    expect(renderTemplate("[{{x}}]", { x: "" })).toBe("[]");
  });
});
