import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/queue", () => ({ send: vi.fn() }));

import { send } from "@vercel/queue";
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

const mockSend = vi.mocked(send);

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
    deliveryId,
  }: {
    event?: string;
    invalidSignature?: boolean;
    noSignature?: boolean;
    deliveryId?: string;
  } = {},
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "x-github-event": event };
  if (deliveryId) headers["x-github-delivery"] = deliveryId;
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

// このルートは署名検証・イベント/actionのフィルタ・デフォルトプロンプト/
// レート制限チェックまでを担当し、実際のAI呼び出しはVercel Queues経由で
// src/lib/process-review-job.tsに委譲する(Issue #106の非同期化、PR #125で
// 発覚したVercel実行時間上限の無言失敗対策)。processReviewJob自体の挙動は
// src/lib/process-review-job.integration.test.tsで検証する。
describe("POST /api/webhooks/github/:repositoryId", () => {
  let userId: string;
  let repositoryId: string;
  let promptWithDiffId: string;
  let promptVersionId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const prompt = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptWithDiffId = prompt.id;
    promptVersionId = prompt.versions[0].id;

    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        webhookEnabled: true,
        webhookId: 999,
        webhookSecret: encryptToken(SECRET),
        defaultPromptId: promptWithDiffId,
      },
    });

    mockSend.mockReset().mockResolvedValue({ messageId: "msg_test" } as never);
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
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("pull_request以外のイベントは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, { action: "opened" }, { event: "issues" }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("opened/synchronize以外のactionは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("closed")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
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
    expect(mockSend).not.toHaveBeenCalled();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
  });

  it("openedイベントでレビューをキューに積む", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("opened"), { deliveryId: "delivery-1" }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [topic, payload, options] = mockSend.mock.calls[0];
    expect(topic).toBe("review-jobs");
    expect(payload).toMatchObject({
      repositoryId,
      userId,
      promptVersionId,
      pullRequestNumber: 42,
      triggeredVia: "WEBHOOK",
    });
    expect(options).toMatchObject({ idempotencyKey: "delivery-1" });
  });

  it("synchronizeイベントでもキューに積む", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("synchronize")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
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
    expect(mockSend).not.toHaveBeenCalled();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("上限");
  });

  it("webhookSecretの復号に失敗した場合は401を返す(TOKEN_ENCRYPTION_KEYローテーション等を想定)", async () => {
    // 正規に暗号化した値の末尾を書き換え、AES-GCMの認証タグ検証を失敗させる
    // (decryptTokenが例外を投げるケースを再現する)。
    const validEncrypted = encryptToken(SECRET);
    const corrupted = validEncrypted.slice(0, -4) + "0000";
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { webhookSecret: corrupted },
    });

    const res = await POST(
      request(repositoryId, pullRequestPayload("opened")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
