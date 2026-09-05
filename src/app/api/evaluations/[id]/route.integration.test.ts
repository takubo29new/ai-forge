import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DELETE, GET } from "./route";
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

describe("GET/DELETE /api/evaluations/:id", () => {
  let userId: string;
  let evaluationId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "この画像を評価してください");
    const promptVersion = await prisma.promptVersion.findFirstOrThrow({
      where: { promptId: prompt.id },
    });
    const evaluation = await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "夕食",
        status: "SUCCESS",
        findings: {
          create: [
            { label: "彩り", tone: "POSITIVE", score: 90, body: "..." },
          ],
        },
      },
    });
    evaluationId = evaluation.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("GET: 認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), ctx(evaluationId));
    expect(res.status).toBe(401);
  });

  it("GET: 他ユーザーの評価には404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await GET(new Request("http://localhost"), ctx(evaluationId));
    expect(res.status).toBe(404);
  });

  it("GET: 自分の評価はfindings付きで返す", async () => {
    const res = await GET(new Request("http://localhost"), ctx(evaluationId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(evaluationId);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].label).toBe("彩り");
  });

  it("DELETE: 他ユーザーの評価には404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await DELETE(
      new Request("http://localhost"),
      ctx(evaluationId),
    );
    expect(res.status).toBe(404);

    const stillThere = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });
    expect(stillThere).not.toBeNull();
  });

  it("DELETE: 自分の評価を削除できる(findingsもカスケード削除される)", async () => {
    const res = await DELETE(
      new Request("http://localhost"),
      ctx(evaluationId),
    );
    expect(res.status).toBe(204);

    const deleted = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });
    expect(deleted).toBeNull();
    const findings = await prisma.evaluationFinding.findMany({
      where: { evaluationId },
    });
    expect(findings).toHaveLength(0);
  });

  it("DELETE: バッチに属するPENDING項目を削除すると完了カウンタが進み、totalに達すればまとめ通知が作られる", async () => {
    const prompt = await createTestPrompt(userId, "batch");
    const promptVersion = await prisma.promptVersion.findFirstOrThrow({
      where: { promptId: prompt.id },
    });
    const batch = await prisma.evaluationBatch.create({
      data: { userId, total: 1 },
    });
    const pending = await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: promptVersion.id,
        inputType: "IMAGE",
        title: "削除される項目",
        status: "PENDING",
        batchId: batch.id,
      },
    });

    const res = await DELETE(new Request("http://localhost"), ctx(pending.id));
    expect(res.status).toBe(204);

    const updatedBatch = await prisma.evaluationBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(updatedBatch.completedCount).toBe(1);

    const notifications = await prisma.notification.findMany({
      where: { userId, link: `/evaluations/batches/${batch.id}` },
    });
    expect(notifications).toHaveLength(1);
  });
});
