import { describe, expect, it } from "vitest";
import { buildChatContext, renderContextForPrompt } from "./chat-context";
import type {
  DocumentChunkSearchHit,
  ExecutionSearchHit,
  PromptVersionSearchHit,
  ReviewCommentSearchHit,
} from "@/lib/embeddings";

function docHit(overrides: Partial<DocumentChunkSearchHit> = {}): DocumentChunkSearchHit {
  return {
    kind: "document_chunk",
    id: "chunk-1",
    documentId: "doc-1",
    documentTitle: "設計書",
    content: "本文",
    distance: 0.5,
    ...overrides,
  };
}

function reviewHit(overrides: Partial<ReviewCommentSearchHit> = {}): ReviewCommentSearchHit {
  return {
    kind: "review_comment",
    id: "comment-1",
    reviewId: "review-1",
    filePath: "src/foo.ts",
    severity: "WARNING",
    body: "未使用の変数があります",
    pullRequestTitle: "Add feature",
    pullRequestNumber: 42,
    distance: 0.3,
    ...overrides,
  };
}

function promptVersionHit(
  overrides: Partial<PromptVersionSearchHit> = {},
): PromptVersionSearchHit {
  return {
    kind: "prompt_version",
    id: "version-1",
    promptId: "prompt-1",
    promptTitle: "コードレビュー用",
    content: "以下の差分をレビューしてください: {{diff}}",
    distance: 0.4,
    ...overrides,
  };
}

function executionHit(overrides: Partial<ExecutionSearchHit> = {}): ExecutionSearchHit {
  return {
    kind: "execution",
    id: "execution-1",
    promptId: "prompt-1",
    promptTitle: "コードレビュー用",
    resultText: "実行結果の本文",
    distance: 0.4,
    ...overrides,
  };
}

describe("buildChatContext", () => {
  it("distanceが小さい(=類似度が高い)順に並べ替える", () => {
    const hits = [docHit({ distance: 0.9 }), reviewHit({ distance: 0.1 })];

    const entries = buildChatContext(hits, 10);

    expect(entries[0].source.kind).toBe("review_comment");
    expect(entries[1].source.kind).toBe("document_chunk");
    expect(entries[0].index).toBe(1);
    expect(entries[1].index).toBe(2);
  });

  it("limit件数で打ち切る", () => {
    const hits = [
      docHit({ id: "a", distance: 0.1 }),
      docHit({ id: "b", distance: 0.2 }),
      docHit({ id: "c", distance: 0.3 }),
    ];

    expect(buildChatContext(hits, 2)).toHaveLength(2);
  });

  it("document_chunkはdocumentTitleをラベルにする", () => {
    const [entry] = buildChatContext([docHit({ documentTitle: "db-design.md" })], 1);
    expect(entry.source).toEqual({
      kind: "document_chunk",
      label: "db-design.md",
      documentId: "doc-1",
    });
  });

  it("review_commentはPR番号・タイトル・ファイルパスをラベルにする", () => {
    const [entry] = buildChatContext([reviewHit()], 1);
    expect(entry.source.label).toBe("PR #42 Add feature(src/foo.ts)");
  });

  it("prompt_versionはpromptTitleをラベルにする", () => {
    const [entry] = buildChatContext([promptVersionHit({ promptTitle: "要約用" })], 1);
    expect(entry.source).toEqual({
      kind: "prompt_version",
      label: "要約用",
      promptId: "prompt-1",
    });
  });

  it("executionは「プロンプト名の実行結果」をラベルにする", () => {
    const [entry] = buildChatContext([executionHit({ promptTitle: "要約用" })], 1);
    expect(entry.source).toEqual({
      kind: "execution",
      label: "要約用の実行結果",
      promptId: "prompt-1",
    });
    expect(entry.text).toBe("実行結果の本文");
  });
});

describe("renderContextForPrompt", () => {
  it("出典番号付きでテキストを連結する", () => {
    const entries = buildChatContext([docHit(), reviewHit()], 10);
    const rendered = renderContextForPrompt(entries);

    expect(rendered).toContain("[出典1:");
    expect(rendered).toContain("[出典2:");
    expect(rendered).toContain("未使用の変数があります");
  });
});
