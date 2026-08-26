import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST/DELETE /api/evaluations/:id/share", () => {
  let userId: string;
  let successEvaluationId: string;
  let pendingEvaluationId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "この画像を評価してください");
    const promptVersion = await prisma.promptVersion.findFirstOrThrow({
      where: { promptId: prompt.id },
    });

    const successEvaluation = await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "share test",
        status: "SUCCESS",
      },
    });
    successEvaluationId = successEvaluation.id;

    const pendingEvaluation = await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "still pending",
        status: "PENDING",
      },
    });
    pendingEvaluationId = pendingEvaluation.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("POST: 認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), ctx(successEvaluationId));
    expect(res.status).toBe(401);
  });

  it("POST: 他ユーザーの評価には404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(new Request("http://localhost"), ctx(successEvaluationId));
    expect(res.status).toBe(404);
  });

  it("POST: PENDINGの評価は共有できず400を返す", async () => {
    const res = await POST(new Request("http://localhost"), ctx(pendingEvaluationId));
    expect(res.status).toBe(400);
  });

  it("POST: SUCCESSの評価は共有トークンを発行する", async () => {
    const res = await POST(new Request("http://localhost"), ctx(successEvaluationId));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.shareToken).toBe("string");

    const stored = await prisma.evaluation.findUnique({
      where: { id: successEvaluationId },
    });
    expect(stored?.shareToken).toBe(body.shareToken);
  });

  it("POST: 既に共有済みなら同じトークンを再度返す(冪等)", async () => {
    const first = await POST(new Request("http://localhost"), ctx(successEvaluationId));
    const firstBody = await first.json();

    const second = await POST(new Request("http://localhost"), ctx(successEvaluationId));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.shareToken).toBe(firstBody.shareToken);
  });

  it("DELETE: 共有を解除するとshareTokenがnullになる", async () => {
    await POST(new Request("http://localhost"), ctx(successEvaluationId));
    const res = await DELETE(new Request("http://localhost"), ctx(successEvaluationId));
    expect(res.status).toBe(204);

    const stored = await prisma.evaluation.findUnique({
      where: { id: successEvaluationId },
    });
    expect(stored?.shareToken).toBeNull();
  });
});
