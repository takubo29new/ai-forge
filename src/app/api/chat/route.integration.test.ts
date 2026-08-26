import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { create: vi.fn() } },
}));
vi.mock("@/lib/voyage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voyage")>()),
  embedQuery: vi.fn(),
}));

import { auth } from "@/auth";
import { anthropic } from "@/lib/anthropic";
import { embedQuery } from "@/lib/voyage";
import { prisma } from "@/lib/prisma";
import {
  setDocumentChunkEmbedding,
  setExecutionEmbedding,
  setPromptVersionEmbedding,
  setReviewCommentEmbedding,
} from "@/lib/embeddings";
import { POST } from "./route";
import { cleanupTestUser, createTestUser } from "@/test/db-helpers";

const mockAuth = vi.mocked(auth) as unknown as Mock<
  () => Promise<{ user: { id: string } } | null>
>;
const mockCreate = vi.mocked(anthropic.messages.create);
const mockEmbedQuery = vi.mocked(embedQuery);

function request(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// 次元ごとにわずかに異なるベクトルを作り、コサイン距離で近さを制御できるようにする。
function vector(base: number, noise = 0): number[] {
  return Array.from({ length: 1024 }, (_, i) => base + (i === 1 ? noise : 0));
}

describe("POST /api/chat", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    mockAuth.mockReset().mockResolvedValue({ user: { id: userId } } as never);
    mockCreate.mockReset();
    mockEmbedQuery.mockReset();
  });

  afterEach(async () => {
    await cleanupTestUser(userId);
  });

  it("認証がなければ401を返す", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(request({ question: "質問" }));
    expect(res.status).toBe(401);
  });

  it("質問が空なら400を返す", async () => {
    const res = await POST(request({ question: "" }));
    expect(res.status).toBe(400);
  });

  it("検索対象が無ければ回答生成をスキップして案内メッセージを返す", async () => {
    mockEmbedQuery.mockResolvedValue(vector(1));
    const res = await POST(request({ question: "質問" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sources).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("ドキュメント・レビュー両方から検索し、出典付きで回答を返す", async () => {
    const document = await prisma.document.create({
      data: {
        title: "db-design.md",
        content: "本文",
        sourceType: "MANUAL",
        userId,
        chunks: {
          create: [{ chunkIndex: 0, content: "RateLimitBucketはupsertでアトミックに更新する" }],
        },
      },
      include: { chunks: true },
    });
    await setDocumentChunkEmbedding(document.chunks[0].id, vector(1));

    const repo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(999), owner: "o", name: "r" },
    });
    const prompt = await prisma.prompt.create({
      data: {
        title: "review",
        userId,
        versions: { create: { versionNumber: 1, content: "レビュー: {{diff}}" } },
      },
      include: { versions: true },
    });
    const review = await prisma.review.create({
      data: {
        repositoryId: repo.id,
        userId,
        promptVersionId: prompt.versions[0].id,
        pullRequestNumber: 7,
        pullRequestTitle: "Fix bug",
        pullRequestUrl: "https://github.com/o/r/pull/7",
        headSha: "abc",
        status: "SUCCESS",
        comments: {
          create: [{ filePath: "src/x.ts", severity: "WARNING", body: "未使用の変数があります" }],
        },
      },
      include: { comments: true },
    });
    await setReviewCommentEmbedding(review.comments[0].id, vector(1, 0.01));

    mockEmbedQuery.mockResolvedValue(vector(1));
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "RateLimitBucketはupsertで更新されます[出典1]" }],
    } as never);

    const res = await POST(request({ question: "RateLimitBucketの実装は?" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.answer).toContain("RateLimitBucket");
    expect(body.sources.length).toBeGreaterThan(0);
    // 埋め込みが完全一致(距離0)のdocument_chunkの方が、わずかにノイズを乗せた
    // review_commentより先に来るはず
    expect(body.sources[0].kind).toBe("document_chunk");

    // このケースはリポジトリ・プロンプトの両方が存在するため、回答生成の前に
    // チャットアクション意図解析(Phase 4項目4)の呼び出しが1回挟まる。
    // 回答生成本体は最後の呼び出しになる。
    const lastCall = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
    const promptSent = lastCall.messages[0].content as string;
    expect(promptSent).toContain("RateLimitBucketはupsertでアトミックに更新する");
  });

  it("プロンプトバージョン・実行結果からも検索し、出典付きで回答を返す", async () => {
    const prompt = await prisma.prompt.create({
      data: {
        title: "要約用プロンプト",
        userId,
        versions: { create: { versionNumber: 1, content: "以下を要約して: {{text}}" } },
      },
      include: { versions: true },
    });
    await setPromptVersionEmbedding(prompt.versions[0].id, vector(1));

    const execution = await prisma.execution.create({
      data: {
        promptVersionId: prompt.versions[0].id,
        userId,
        model: "claude-test",
        resultText: "要約結果のテキスト",
        status: "SUCCESS",
      },
    });
    await setExecutionEmbedding(execution.id, vector(1, 0.01));

    mockEmbedQuery.mockResolvedValue(vector(1));
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "要約結果です[出典1]" }],
    } as never);

    const res = await POST(request({ question: "要約プロンプトの内容は?" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const kinds = body.sources.map((s: { kind: string }) => s.kind);
    expect(kinds).toContain("prompt_version");
    expect(kinds).toContain("execution");

    const promptVersionSource = body.sources.find(
      (s: { kind: string }) => s.kind === "prompt_version",
    );
    expect(promptVersionSource).toMatchObject({
      label: "要約用プロンプト",
      promptId: prompt.id,
    });

    const executionSource = body.sources.find(
      (s: { kind: string }) => s.kind === "execution",
    );
    expect(executionSource).toMatchObject({
      label: "要約用プロンプトの実行結果",
      promptId: prompt.id,
    });
  });

  it("他ユーザーのrepositoryIdを指定すると400を返す", async () => {
    const other = await createTestUser();
    const otherRepo = await prisma.repository.create({
      data: { userId: other.id, githubRepoId: BigInt(12345), owner: "o", name: "r" },
    });

    mockEmbedQuery.mockResolvedValue(vector(1));
    const res = await POST(
      request({ question: "質問", repositoryId: otherRepo.id }),
    );
    expect(res.status).toBe(400);

    await cleanupTestUser(other.id);
  });

  it("repositoryId指定時は該当リポジトリのDocument・ReviewCommentのみに絞り込む", async () => {
    const targetRepo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(1001), owner: "o", name: "target" },
    });
    const otherRepo = await prisma.repository.create({
      data: { userId, githubRepoId: BigInt(1002), owner: "o", name: "other" },
    });

    const targetDoc = await prisma.document.create({
      data: {
        title: "target/README.md",
        content: "本文",
        sourceType: "REPO_FILE",
        sourcePath: "README.md",
        userId,
        repositoryId: targetRepo.id,
        chunks: { create: [{ chunkIndex: 0, content: "対象リポジトリの設計内容" }] },
      },
      include: { chunks: true },
    });
    await setDocumentChunkEmbedding(targetDoc.chunks[0].id, vector(1));

    const otherDoc = await prisma.document.create({
      data: {
        title: "other/README.md",
        content: "本文",
        sourceType: "REPO_FILE",
        sourcePath: "README.md",
        userId,
        repositoryId: otherRepo.id,
        chunks: { create: [{ chunkIndex: 0, content: "別リポジトリの設計内容" }] },
      },
      include: { chunks: true },
    });
    await setDocumentChunkEmbedding(otherDoc.chunks[0].id, vector(1));

    mockEmbedQuery.mockResolvedValue(vector(1));
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "回答[出典1]" }],
    } as never);

    const res = await POST(
      request({ question: "設計内容は?", repositoryId: targetRepo.id }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const documentIds = body.sources
      .filter((s: { kind: string }) => s.kind === "document_chunk")
      .map((s: { documentId: string }) => s.documentId);
    expect(documentIds).toContain(targetDoc.id);
    expect(documentIds).not.toContain(otherDoc.id);
  });

  describe("チャットからの直接アクション実行(Phase 4項目4)", () => {
    it("意図解析でツールが呼ばれたらアクション提案を返し、RAG検索は行わない", async () => {
      const repo = await prisma.repository.create({
        data: { userId, githubRepoId: BigInt(2001), owner: "o", name: "target" },
      });
      const prompt = await prisma.prompt.create({
        data: {
          title: "コードレビュー用",
          userId,
          versions: { create: { versionNumber: 1, content: "レビュー: {{diff}}" } },
        },
      });

      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "propose_review_execution",
            input: {
              repositoryId: repo.id,
              pullRequestNumber: 42,
              promptId: prompt.id,
            },
          },
        ],
      } as never);

      const res = await POST(
        request({ question: "target/repoのPR #42をコードレビュー用プロンプトでレビューして" }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.actionProposal).toMatchObject({
        repositoryId: repo.id,
        repositoryLabel: "o/target",
        pullRequestNumber: 42,
        promptId: prompt.id,
        promptLabel: "コードレビュー用",
      });
      expect(body.answer).toBeUndefined();
      expect(mockEmbedQuery).not.toHaveBeenCalled();
    });

    it("意図解析でツールが呼ばれなければ通常のRAG回答にフォールバックする", async () => {
      await prisma.repository.create({
        data: { userId, githubRepoId: BigInt(2002), owner: "o", name: "r" },
      });
      await prisma.prompt.create({
        data: {
          title: "何かのプロンプト",
          userId,
          versions: { create: { versionNumber: 1, content: "本文" } },
        },
      });

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "(何もしない)" }],
      } as never);
      mockEmbedQuery.mockResolvedValue(vector(1));

      const res = await POST(request({ question: "こんにちは" }));
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.actionProposal).toBeUndefined();
      expect(body.sources).toEqual([]);
      // 検索対象が0件のため、意図解析の1回だけが呼ばれ、回答生成の
      // Claude呼び出しはスキップされる。
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("実在しないリポジトリ・プロンプトを指すツール呼び出しは無視してフォールバックする", async () => {
      await prisma.repository.create({
        data: { userId, githubRepoId: BigInt(2003), owner: "o", name: "r" },
      });
      await prisma.prompt.create({
        data: {
          title: "何かのプロンプト",
          userId,
          versions: { create: { versionNumber: 1, content: "本文" } },
        },
      });

      mockCreate.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "propose_review_execution",
            input: {
              repositoryId: "does-not-exist",
              pullRequestNumber: 1,
              promptId: "does-not-exist",
            },
          },
        ],
      } as never);
      mockEmbedQuery.mockResolvedValue(vector(1));

      const res = await POST(request({ question: "適当なリポジトリをレビューして" }));
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.actionProposal).toBeUndefined();
      expect(body.sources).toEqual([]);
    });
  });
});
