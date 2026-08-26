import { describe, expect, it } from "vitest";
import { generateShareToken } from "./share-token";

describe("generateShareToken", () => {
  it("URLセーフな文字のみで構成される", () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("呼び出すたびに異なる値を返す", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateShareToken()));
    expect(tokens.size).toBe(20);
  });
});
