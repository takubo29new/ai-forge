import { beforeEach, describe, expect, it } from "vitest";
import { encryptField, decryptFieldSafe } from "./field-crypto";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-vitest";
});

describe("decryptFieldSafe", () => {
  it("round-trips a value encrypted with the current key", () => {
    const encrypted = encryptField("機微な評価結果テキスト");
    expect(decryptFieldSafe(encrypted)).toBe("機微な評価結果テキスト");
  });

  it("falls back to a placeholder instead of throwing when the key doesn't match (rotation後の古いデータ)", () => {
    const encrypted = encryptField("旧鍵で暗号化されたテキスト");
    process.env.TOKEN_ENCRYPTION_KEY = "a-different-key-after-rotation";
    expect(() => decryptFieldSafe(encrypted)).not.toThrow();
    expect(decryptFieldSafe(encrypted)).toContain("表示できません");
  });
});
