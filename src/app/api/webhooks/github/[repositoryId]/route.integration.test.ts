import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  return {
    action,
    pull_request: {
      number,
      title: "Add feature",
      html_url: "https://github.com/octo-test/repo-test/pull/42",
      head: { sha: "abc123" },
    },
  };
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
    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();
  });

  it("pull_request以外のイベントは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, { action: "opened" }, { event: "issues" }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();
  });

  it("opened/synchronize以外のactionは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("closed")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();
  });

  it("PRのtitle/html_url/head.shaが無いペイロードは無視して200を返す", async () => {
    const res = await POST(
      request(repositoryId, { action: "opened", pull_request: { number: 42 } }),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);
    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();
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

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();

    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain("スキップ");
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

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();

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
    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review).toBeNull();
  });

  it("openedイベントでReviewをPENDINGとして作成する(実処理はGitHub Actionsワーカーが行う、Issue #129)", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("opened")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review?.status).toBe("PENDING");
    expect(review?.triggeredVia).toBe("WEBHOOK");
    expect(review?.pullRequestNumber).toBe(42);
    expect(review?.pullRequestTitle).toBe("Add feature");
    expect(review?.pullRequestUrl).toBe("https://github.com/octo-test/repo-test/pull/42");
    expect(review?.headSha).toBe("abc123");
    expect(review?.promptVersionId).toBeTruthy();

    // 処理はワーカー側で行うため、この時点ではまだ通知を作らない。
    const notifications = await prisma.notification.findMany({ where: { userId } });
    expect(notifications).toHaveLength(0);
  });

  it("synchronizeイベントでもReviewをPENDINGとして作成する", async () => {
    const res = await POST(
      request(repositoryId, pullRequestPayload("synchronize")),
      ctx(repositoryId),
    );
    expect(res.status).toBe(200);

    const review = await prisma.review.findFirst({ where: { repositoryId } });
    expect(review?.status).toBe("PENDING");
    expect(review?.triggeredVia).toBe("WEBHOOK");
  });
});
