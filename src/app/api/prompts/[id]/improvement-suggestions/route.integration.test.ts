import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
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
const mockParse = vi.mocked(anthropic.messages.parse);

function request() {
  return new Request("http://localhost/api/prompts/x/improvement-suggestions", {
    method: "POST",
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// このAPIは過去のReviewCommentを分析対象にするため、テスト用のReview+
// ReviewCommentをまとめて作る(db-helpers.tsに専用ヘルパーは無いため
// このテストファイル内に閉じたローカルヘルパーとして持つ)。
async function createTestReviewComment(
  userId: string,
  promptVersionId: string,
) {
  const repository = await createTestRepository(userId);
  const review = await prisma.review.create({
    data: {
      repositoryId: repository.id,
      userId,
      promptVersionId,
      pullRequestNumber: 1,
      pullRequestTitle: "test PR",
      pullRequestUrl: "https://github.com/octo-test/repo-test/pull/1",
      headSha: "abc123",
      status: "SUCCESS",
      comments: {
        create: {
          filePath: "src/foo.ts",
          line: 10,
          severity: "WARNING",
          body: "エラーハンドリングが不足しています",
        },
      },
    },
  });
  return review;
}

describe("POST /api/prompts/:id/improvement-suggestions", () => {
  let userId: string;
  let promptId: string;
  let promptVersionId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "PRをレビューしてください: {{diff}}");
    promptId = prompt.id;
    promptVersionId = prompt.versions[0].id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockParse.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(401);
  });

  it("他ユーザーのプロンプトには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(404);
  });

  it("存在しないプロンプトには404を返す", async () => {
    const res = await POST(request(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("過去のレビュー指摘が0件の場合は400を返し、Claudeを呼ばない", async () => {
    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(400);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("成功時は200でsummary・suggestionsを返し、Executionを作成しない", async () => {
    await createTestReviewComment(userId, promptVersionId);
    mockParse.mockResolvedValue({
      parsed_output: {
        summary: "エラーハンドリングの指摘が繰り返されています",
        suggestions: [
          {
            pattern: "エラーハンドリング漏れ",
            suggestion: "try/catchを必ず含めるよう指示を追加する",
            occurrenceCount: 1,
          },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);

    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("エラーハンドリングの指摘が繰り返されています");
    expect(body.suggestions).toHaveLength(1);
    expect(body.commentCount).toBe(1);

    const executionCount = await prisma.execution.count({ where: { userId } });
    expect(executionCount).toBe(0);
  });

  it("改善提案系レート制限の上限に達すると429を返す", async () => {
    await createTestReviewComment(userId, promptVersionId);

    const hourMs = 60 * 60 * 1000;
    const windowStart = new Date(Math.floor(Date.now() / hourMs) * hourMs);
    await prisma.rateLimitBucket.create({
      data: { userId, windowStart, purpose: "improvement-suggestion", count: 10 },
    });

    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(429);
    expect(mockParse).not.toHaveBeenCalled();
  });

  it("Claude呼び出し失敗時は502を返す", async () => {
    await createTestReviewComment(userId, promptVersionId);
    mockParse.mockRejectedValue(new Error("upstream boom"));

    const res = await POST(request(), ctx(promptId));
    expect(res.status).toBe(502);
  });
});
