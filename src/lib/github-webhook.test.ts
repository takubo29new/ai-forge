import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateWebhookSecret, verifyWebhookSignature } from "./github-webhook";

function sign(body: string, secret: string) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("generateWebhookSecret", () => {
  it("十分な長さ・毎回異なる値を生成する", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ action: "opened" });

  it("正しい署名を検証できる", () => {
    expect(verifyWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("secretが異なると失敗する", () => {
    expect(verifyWebhookSignature(body, sign(body, "wrong-secret"), secret)).toBe(false);
  });

  it("ボディが改ざんされていると失敗する", () => {
    const tampered = JSON.stringify({ action: "closed" });
    expect(verifyWebhookSignature(tampered, sign(body, secret), secret)).toBe(false);
  });

  it("ヘッダーが無いと失敗する", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("sha256=プレフィックスが無いと失敗する", () => {
    const raw = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, raw, secret)).toBe(false);
  });
});
