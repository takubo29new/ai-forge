import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { auth } from "@/auth";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockEmbedDocuments = vi.mocked(embedDocuments);

function fakeEmbedding(seed: number) {
  return Array.from({ length: 1024 }, (_, i) => (i === 0 ? seed : 0));
}

async function createExecution(
  userId: string,
  promptVersionId: string,
  overrides: Partial<{ status: "SUCCESS" | "FAILED"; resultText: string | null }> = {},
) {
  return prisma.execution.create({
    data: {
      promptVersionId,
      userId,
      model: "claude-test",
      resultText: overrides.resultText ?? "実行結果テキスト",
      status: overrides.status ?? "SUCCESS",
    },
  });
}

describe("POST /api/executions/backfill-embeddings", () => {
  let userId: string;
  let promptVersionId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "本文");
    promptVersionId = prompt.versions[0].id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockEmbedDocuments.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("未処理の実行結果が無ければprocessed: 0を返す", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
  });

  it("reviewを伴わないSUCCESS実行にembeddingを追加する", async () => {
    const execution = await createExecution(userId, promptVersionId);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 1, remaining: false });

    const embedded = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::int AS count FROM "ExecutionEmbedding"
      WHERE "executionId" = ${execution.id}
    `;
    expect(Number(embedded[0].count)).toBe(1);
  });

  it("FAILEDな実行は対象にしない", async () => {
    await createExecution(userId, promptVersionId, {
      status: "FAILED",
      resultText: null,
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("レビュー由来のSUCCESS実行は対象にしない", async () => {
    const repo = await createTestRepository(userId);
    const execution = await createExecution(userId, promptVersionId, {
      resultText: JSON.stringify({ findings: [] }),
    });
    await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId,
        executionId: execution.id,
        pullRequestNumber: 1,
        pullRequestTitle: "test",
        pullRequestUrl: "https://github.com/o/r/pull/1",
        headSha: "abc",
        status: "SUCCESS",
      },
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("AI評価由来のSUCCESS実行は対象にしない", async () => {
    const execution = await createExecution(userId, promptVersionId, {
      resultText: "(AI評価の結果は暗号化してEvaluationに個別保存されています)",
    });
    await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId,
        executionId: execution.id,
        inputType: "TEXT",
        title: "test",
        status: "SUCCESS",
      },
    });

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });

  it("既に埋め込み済みの実行結果は対象にしない", async () => {
    await createExecution(userId, promptVersionId);
    mockEmbedDocuments.mockResolvedValue([fakeEmbedding(1)]);
    await POST();

    mockEmbedDocuments.mockClear();
    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ processed: 0, remaining: false });
    expect(mockEmbedDocuments).not.toHaveBeenCalled();
  });
});
