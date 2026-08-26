import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";
import { cleanupTestUser, createTestPrompt, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/prompts/:id/executions", () => {
  let userId: string;
  let promptId: string;
  let promptVersionId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "本文");
    promptId = prompt.id;
    promptVersionId = prompt.versions[0].id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/x"), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await GET(new Request("http://localhost/x"), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("このプロンプトの実行履歴のみを新しい順で返す", async () => {
    const otherPrompt = await createTestPrompt(userId, "別プロンプト");
    await prisma.execution.create({
      data: {
        promptVersionId: otherPrompt.versions[0].id,
        userId,
        model: "claude-test",
        resultText: "別プロンプトの結果",
        status: "SUCCESS",
      },
    });
    await prisma.execution.create({
      data: {
        promptVersionId,
        userId,
        model: "claude-test",
        resultText: "このプロンプトの結果",
        status: "SUCCESS",
      },
    });

    const res = await GET(new Request("http://localhost/x"), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].resultText).toBe("このプロンプトの結果");
  });
});
