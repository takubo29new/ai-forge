import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";
import { cleanupTestUser, createTestPrompt, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;

function request(query: string) {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(query)}`);
}

describe("GET /api/search", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(request("test"));
    expect(res.status).toBe(401);
  });

  it("qが空ならすべてのグループを空配列で返す", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      prompts: [],
      categories: [],
      repositories: [],
      documents: [],
      evaluations: [],
      reviews: [],
    });
  });

  it("プロンプト・カテゴリ・リポジトリを大文字小文字を区別せず部分一致で検索する", async () => {
    const prompt = await prisma.prompt.create({
      data: {
        title: "Weekly Report Prompt",
        userId,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });
    const category = await prisma.category.create({ data: { userId, name: "Report Category" } });
    const repo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(5001), owner: "octo-report", name: "app" },
    });

    const promptRes = await GET(request("report"));
    const promptBody = await promptRes.json();
    expect(promptBody.prompts.map((p: { id: string }) => p.id)).toContain(prompt.id);
    expect(promptBody.categories.map((c: { id: string }) => c.id)).toContain(category.id);
    expect(promptBody.repositories.map((r: { id: string }) => r.id)).toContain(repo.id);
    expect(
      promptBody.repositories.find((r: { id: string }) => r.id === repo.id).label,
    ).toBe("octo-report/app");
  });

  it("他ユーザーのデータは結果に含まれない", async () => {
    const other = await createTestUser();
    await prisma.prompt.create({
      data: {
        title: "shared-keyword prompt",
        userId: other.id,
        versions: { create: { versionNumber: 1, content: "c" } },
      },
    });

    const res = await GET(request("shared-keyword"));
    const body = await res.json();
    expect(body.prompts).toEqual([]);

    await cleanupTestUser(other.id);
  });

  it("ドキュメント・評価・レビューも検索対象になる", async () => {
    const prompt = await createTestPrompt(userId, "diff: {{diff}}");
    const repo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(5002), owner: "o", name: "r" },
    });

    const document = await prisma.document.create({
      data: {
        title: "matching-keyword design doc",
        content: "本文",
        sourceType: "MANUAL",
        userId,
      },
    });
    const evaluation = await prisma.evaluation.create({
      data: {
        userId,
        promptVersionId: prompt.versions[0].id,
        inputType: "TEXT",
        title: "matching-keyword evaluation",
        status: "SUCCESS",
      },
    });
    const review = await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId: prompt.versions[0].id,
        pullRequestNumber: 7,
        pullRequestTitle: "matching-keyword PR",
        pullRequestUrl: "https://github.com/o/r/pull/7",
        headSha: "abc",
        status: "SUCCESS",
      },
    });

    const res = await GET(request("matching-keyword"));
    const body = await res.json();
    expect(body.documents.map((d: { id: string }) => d.id)).toContain(document.id);
    expect(body.evaluations.map((e: { id: string }) => e.id)).toContain(evaluation.id);
    expect(body.reviews.map((r: { id: string }) => r.id)).toContain(review.id);
    expect(
      body.reviews.find((r: { id: string }) => r.id === review.id).label,
    ).toBe("#7 matching-keyword PR");
  });
});
