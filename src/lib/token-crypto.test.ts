import { beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, isEncryptedToken } from "./token-crypto";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-for-vitest";
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a plaintext token", () => {
    const encrypted = encryptToken("gho_exampleAccessToken123");
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(decryptToken(encrypted)).toBe("gho_exampleAccessToken123");
  });

  it("produces different ciphertext for the same input each time (random IV)", () => {
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
  });

  it("treats un-prefixed legacy values as plaintext for backward compatibility", () => {
    const legacyPlainToken = "gho_legacyUnencryptedToken";
    expect(isEncryptedToken(legacyPlainToken)).toBe(false);
    expect(decryptToken(legacyPlainToken)).toBe(legacyPlainToken);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is not set", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow();
  });
});
