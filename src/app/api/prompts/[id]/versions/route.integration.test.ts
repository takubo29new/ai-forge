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

describe("GET /api/prompts/:id/versions", () => {
  let userId: string;
  let promptId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    const prompt = await createTestPrompt(userId, "v1");
    promptId = prompt.id;
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

  it("バージョン番号の新しい順ですべてのバージョンを返す", async () => {
    await prisma.promptVersion.create({
      data: { promptId, versionNumber: 2, content: "v2" },
    });

    const res = await GET(new Request("http://localhost/x"), ctx(promptId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].versionNumber).toBe(2);
    expect(body[1].versionNumber).toBe(1);
  });
});
