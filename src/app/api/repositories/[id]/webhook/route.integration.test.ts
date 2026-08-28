import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/github", () => ({
  getGitHubClient: vi.fn(),
}));

import { auth } from "@/auth";
import { getGitHubClient } from "@/lib/github";
import { prisma } from "@/lib/prisma";
import { decryptToken, isEncryptedToken } from "@/lib/token-crypto";
import { POST, DELETE } from "./route";
import {
  cleanupTestUser,
  createTestPrompt,
  createTestRepository,
  createTestUser,
} from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockGetClient = vi.mocked(getGitHubClient);

function request(body: unknown) {
  return new Request("http://localhost/api/repositories/x/webhook", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST/DELETE /api/repositories/:id/webhook", () => {
  let userId: string;
  let repositoryId: string;
  let promptWithDiffId: string;
  let promptWithoutDiffId: string;
  let createWebhook: ReturnType<typeof vi.fn>;
  let deleteWebhook: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;

    const repo = await createTestRepository(userId);
    repositoryId = repo.id;

    const withDiff = await createTestPrompt(userId, "レビューして: {{diff}}");
    promptWithDiffId = withDiff.id;
    const withoutDiff = await createTestPrompt(userId, "diffを含まない本文");
    promptWithoutDiffId = withoutDiff.id;

    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);

    createWebhook = vi.fn().mockResolvedValue({ data: { id: 12345 } });
    deleteWebhook = vi.fn().mockResolvedValue({});
    mockGetClient.mockReset().mockResolvedValue({
      rest: { repos: { createWebhook, deleteWebhook } },
    } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("他ユーザーのリポジトリには404を返す", async () => {
    mockAuth.mockResolvedValue({ user: { id: "someone-else" } } as never);
    const res = await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));
    expect(res.status).toBe(404);
  });

  it("{{diff}}を含まないプロンプトには400を返す", async () => {
    const res = await POST(request({ promptId: promptWithoutDiffId }), ctx(repositoryId));
    expect(res.status).toBe(400);
    expect(createWebhook).not.toHaveBeenCalled();
  });

  it("有効化するとGitHub側にWebhookを作成し、secretを暗号化して保存する", async () => {
    const res = await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));
    expect(res.status).toBe(200);
    expect(createWebhook).toHaveBeenCalledTimes(1);
    const call = createWebhook.mock.calls[0][0];
    expect(call.config.url).toContain(`/api/webhooks/github/${repositoryId}`);
    expect(call.events).toEqual(["pull_request"]);

    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    expect(repository.webhookEnabled).toBe(true);
    expect(repository.webhookId).toBe(12345);
    expect(repository.defaultPromptId).toBe(promptWithDiffId);
    expect(repository.webhookSecret).not.toBeNull();
    expect(isEncryptedToken(repository.webhookSecret!)).toBe(true);
    // secretはconfig.secretとして渡した平文を復号すれば一致するはず
    expect(decryptToken(repository.webhookSecret!)).toBe(call.config.secret);
  });

  it("WebhookのURLが到達不能な場合(ローカル開発環境等)は専用のエラーメッセージを返す", async () => {
    createWebhook.mockRejectedValue(
      new Error(
        'Validation Failed: {"resource":"Hook","code":"custom","field":"url","message":"url is not supported because it isn\'t reachable over the public Internet (localhost)"} - https://docs.github.com/rest/repos/webhooks#create-a-repository-webhook',
      ),
    );

    const res = await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("公開インターネットから到達できない");

    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    expect(repository.webhookEnabled).toBe(false);
  });

  it("既に有効な場合はGitHub側を再作成せずデフォルトプロンプトのみ更新する", async () => {
    await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));
    createWebhook.mockClear();

    const anotherPrompt = await createTestPrompt(userId, "別のレビュー: {{diff}}");
    const res = await POST(request({ promptId: anotherPrompt.id }), ctx(repositoryId));
    expect(res.status).toBe(200);
    expect(createWebhook).not.toHaveBeenCalled();

    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    expect(repository.defaultPromptId).toBe(anotherPrompt.id);
  });

  it("無効化するとGitHub側のWebhookを削除し、フィールドをクリアする", async () => {
    await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));

    const res = await DELETE(new Request("http://localhost/api/repositories/x/webhook", { method: "DELETE" }), ctx(repositoryId));
    expect(res.status).toBe(204);
    expect(deleteWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ hook_id: 12345 }),
    );

    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    expect(repository.webhookEnabled).toBe(false);
    expect(repository.webhookId).toBeNull();
    expect(repository.webhookSecret).toBeNull();
    expect(repository.defaultPromptId).toBeNull();
  });

  it("GitHub側の削除に失敗してもDB側は無効化される(ベストエフォート)", async () => {
    await POST(request({ promptId: promptWithDiffId }), ctx(repositoryId));
    deleteWebhook.mockRejectedValue(new Error("already deleted"));

    const res = await DELETE(new Request("http://localhost/api/repositories/x/webhook", { method: "DELETE" }), ctx(repositoryId));
    expect(res.status).toBe(204);

    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    expect(repository.webhookEnabled).toBe(false);
  });
});
