import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { parse: vi.fn() } },
}));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
  getPullRequest: vi.fn(),
  getPullRequestDiff: vi.fn(),
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedDocuments: vi.fn(),
}));

import { anthropic } from "@/lib/anthropic";
import { getGitHubClient, getPullRequest, getPullRequestDiff } from "@/lib/github";
import { embedDocuments } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import { generateWebhookSecret } from "@/lib/github-webhook";
import { POST } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockParse = vi.mocked(anthropic.messages.parse);
const mockGetClient = vi.mocked(getGitHubClient);
const mockGetPR = vi.mocked(getPullRequest);
const mockGetDiff = vi.mocked(getPullRequestDiff);
const mockEmbedDocuments = vi.mocked(embedDocuments);

const SECRET = generateWebhookSecret();

function sign(body: string) {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

function request(
  repositoryId: string,
  payload: unknown,
  {
    event = "pull_request",
    invalidSignature = false,
    noSignature = false,
  }: { event?: string; invalidSignature?: boolean; noSignature?: boolean } = {},
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "x-github-event": event };
  if (!noSignature) {
    headers["x-hub-signature-256"] = invalidSignature
      ? "sha256=" + "0".repeat(64)
      : sign(body);
  }
  return new Request(`http://localhost/api/webhooks/github/${repositoryId}`, {
    method: "POST",
    headers,
    body,
  });
}

function ctx(repositoryId: string) {
  return { params: Promise.resolve({ repositoryId }) };
}

function pullRequestPayload(action: string, number = 42) {
  return { action, pull_request: { number } };
}

describe("POST /api/webhooks/github/:repositoryId", () => {
  let userId: string;
  let repositoryId: string;
  let promptWithDiffId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const prompt = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptWithDiffId = prompt.id;

    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        webhookEnabled: true,
        webhookId: 999,
        webhookSecret: encryptToken(SECRET),
        defaultPromptId: promptWithDiffId,
      },
    });

    mockParse.mockReset();
    mockGetClient.mockReset().mockResolvedValue({} as never);
    mockGetPR.mockReset().mockResolvedValue({
      number: 42,
      title: "Add feature",
      url: "https://github.com/octo-test/repo-test/pull/42",
      headSha: "abc123",
    });
    mockGetDiff.mockReset().mockResolvedValue({
      diff: "diff --git a/x b/x",
      truncated: false,
    });
    mockEmbedDocuments.mockReset().mockResolvedValue([]);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("Webhookが無効なリポジトリには404を返す", async () => {
    const other = await createTestRepository(userId);
    const res = await POST(
      request(other.id, pullRequestPayload("opened")),
      ctx(other.id),
    );
    expect(res.status).toBe(404);
  });

  it("署名が一致しなければ401を返す", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("opened"), { invalidSignature: true }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(401);
  });

  it("署名ヘッダーが無ければ401を返す", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("opened"), { noSignature: true }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(401);
  });

  it("pingイベントには200のみ返す(レビューは実行しない)", async () => {
    const res = await POST(
      request(repositoryId, {}, { event: "ping" }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockGetPR).not.toHaveBeenCalled();
  });

  it("pull_request以外のイベントは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, { action: "opened" }, { event: "issues" }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockGetPR).not.toHaveBeenCalled();
  });

  it("opened/synchronize以外のactionは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("closed")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockGetPR).not.toHaveBeenCalled();
  });

  it("デフォルトプロンプト未設定の場合はスキップし通知を作成する", async () => {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { defaultPromptId: null },
    });

    const res = await POST(
      request(repositoryId, pullRequestPayload("opened")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockGetPR).not.toHaveBeenCalled();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
  });

  it("openedイベントでレビューを実行しWEBHOOKとして記録する", async () => {
    mockParse.mockResolvedValue({
      parsed_output: {
        findings: [
          { filePath: "src/x.ts", line: 3, severity: "WARNING", body: "未使用の変数" },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    } as never);

    const res = await POST(
      request(repositoryId, pullRequestPayload("opened")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    const review = await prisma.review.findFirst({
      where: { repositoryId },
      include: { comments: true },
    });
    expect(review?.status).toBe("SUCCESS");
    expect(review?.triggeredVia).toBe("WEBHOOK");
    expect(review?.comments).toHaveLength(1);

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("完了");
    expect(notifications[0].link).toBe(`/reviews/${review!.id}`);
  });

  it("synchronizeイベントでもレビューを実行する", async () => {
    mockParse.mockResolvedValue({
      parsed_output: { findings: [] },
      usage: { input_tokens: 100, output_tokens: 10 },
    } as never);

    const res = await POST(
      request(repositoryId, pullRequestPayload("synchronize")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review?.triggeredVia).toBe("WEBHOOK");
  });

  it("レート制限に達している場合はスキップし通知を作成する", async () => {
    const windowStart = new Date(Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000));
    await prisma.rateLimitBucket.create({
      data: { userId, windowStart, purpose: "execution", count: 20 },
    });

    const res = await POST(
      request(repositoryId, pullRequestPayload("opened")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockGetPR).not.toHaveBeenCalled();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("上限");
  });
});
