import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

// ルートレベルの統合テスト用ヘルパー。実際のPostgresに対してユーザー・プロンプト・
// リポジトリを作成し、テスト後は明示的な依存順で削除する。User起点のonDelete: Cascadeに
// 任せない理由は、Review.promptVersionIdがonDelete: Restrictのため、カスケードの実行順序に
// よっては削除が失敗しうるため(db-design.md参照)。

export async function createTestUser() {
  return prisma.user.create({
    data: { email: `test-${randomUUID()}@example.test`, name: "Integration Test User" },
  });
}

export async function createTestPrompt(userId: string, content: string) {
  return prisma.prompt.create({
    data: {
      title: "Integration Test Prompt",
      userId,
      versions: { create: { versionNumber: 1, content } },
    },
    include: { versions: true },
  });
}

export async function createTestRepository(userId: string) {
  return prisma.repository.create({
    data: {
      userId,
      githubRepoId:
        BigInt(Date.now()) * BigInt(1000) +
        BigInt(Math.floor(Math.random() * 1000)),
      owner: "octo-test",
      name: "repo-test",
    },
  });
}

export async function cleanupTestUser(userId: string) {
  await prisma.reviewComment.deleteMany({ where: { review: { userId } } });
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.execution.deleteMany({ where: { userId } });
  await prisma.promptVersion.deleteMany({ where: { prompt: { userId } } });
  await prisma.prompt.deleteMany({ where: { userId } });
  await prisma.repository.deleteMany({ where: { userId } });
  await prisma.rateLimitBucket.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}
