import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { create: vi.fn() } },
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestUser,
} from "@/test/db-helpers";

// next-authのauth()はミドルウェアとしても呼べるよう複数のオーバーロードを持ち、
// そのままではmockResolvedValue(null)等が型エラーになるため、テストで実際に
// 使う「セッション取得関数」としての形に絞って再キャストする。
const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockCreate = vi.mocked(anthropic.messages.create);

function request(body: unknown) {
  return new Request("http://localhost/api/prompts/x/execute", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/prompts/:id/execute", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "こんにちは、{{name}}さん");
    promptId = prompt.id;

    mockAuth.mockReset();
    mockCreate.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(request({}), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(request({}), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("存在しないpromptVersionIdには400を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } } as never);
    const res = await POST(
      request({ promptVersionId: "does-not-exist" }),
      ctx(promptId),
    );
    expect(res.status).toBe(400);
  });

  it("成功時はExecutionをSUCCESSで作成し201を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } } as never);
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "こんにちは、太郎さん" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    } as never);

    const res = await POST(
      request({ variables: { name: "太郎" } }),
      ctx(promptId),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.status).toBe("SUCCESS");
    expect(body.resultText).toBe("こんにちは、太郎さん");

    const execution = await prisma.execution.findUnique({
      where: { id: body.id },
    });
    expect(execution?.status).toBe("SUCCESS");
  });

  it("AI呼び出し失敗時はExecutionをFAILEDで作成し200を返す(201にしない)", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } } as never);
    mockCreate.mockRejectedValue(new Error("upstream boom"));

    const res = await POST(request({}), ctx(promptId));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("FAILED");
    expect(body.errorMessage).toContain("upstream boom");
  });

  it("実行系レート制限の上限に達すると429を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: userId } } as never);
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never);

    const hourMs = 60 * 60 * 1000;
    const windowStart = new Date(Math.floor(Date.now() / hourMs) * hourMs);
    await prisma.rateLimitBucket.create({
      data: { userId, windowStart, purpose: "execution", count: 20 },
    });

    const res = await POST(request({}), ctx(promptId));
    expect(res.status).toBe(429);
  });
});
