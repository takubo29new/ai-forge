import type {
  DocumentChunkSearchHit,
  ExecutionSearchHit,
  PromptVersionSearchHit,
  ReviewCommentSearchHit,
} from "@/lib/embeddings";

type SearchHit =
  | DocumentChunkSearchHit
  | ReviewCommentSearchHit
  | PromptVersionSearchHit
  | ExecutionSearchHit;

export type ChatSource =
  | { kind: "document_chunk"; label: string; documentId: string }
  | { kind: "review_comment"; label: string; reviewId: string }
  | { kind: "prompt_version"; label: string; promptId: string }
  | { kind: "execution"; label: string; promptId: string };

export type ChatContextEntry = {
  index: number;
  text: string;
  source: ChatSource;
};

// チャットからの直接アクション実行(Phase 4項目4)で、意図解析の結果として
// 提案する操作。実行はここでは行わず、フロント側の確認ダイアログでユーザーが
// 承認した場合のみPOST /api/repositories/:id/reviewsを呼び出す
// (docs/phase4-design.md「4. チャットからの直接アクション実行」参照)。
export type ChatActionProposal = {
  repositoryId: string;
  repositoryLabel: string;
  pullRequestNumber: number;
  promptId: string;
  promptLabel: string;
};

// DocumentChunk・ReviewComment・PromptVersion・Execution4つの検索結果をコサイン距離で
// マージし、上位limit件をClaudeへ渡す文脈として整形する。
export function buildChatContext(
  hits: SearchHit[],
  limit: number,
): ChatContextEntry[] {
  return [...hits]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((hit, i) => {
      if (hit.kind === "document_chunk") {
        return {
          index: i + 1,
          text: hit.content,
          source: {
            kind: "document_chunk",
            label: hit.documentTitle,
            documentId: hit.documentId,
          },
        };
      }
      if (hit.kind === "review_comment") {
        return {
          index: i + 1,
          text: hit.body,
          source: {
            kind: "review_comment",
            label: `PR #${hit.pullRequestNumber} ${hit.pullRequestTitle}(${hit.filePath})`,
            reviewId: hit.reviewId,
          },
        };
      }
      if (hit.kind === "prompt_version") {
        return {
          index: i + 1,
          text: hit.content,
          source: {
            kind: "prompt_version",
            label: hit.promptTitle,
            promptId: hit.promptId,
          },
        };
      }
      return {
        index: i + 1,
        text: hit.resultText,
        source: {
          kind: "execution",
          label: `${hit.promptTitle}の実行結果`,
          promptId: hit.promptId,
        },
      };
    });
}

export function renderContextForPrompt(entries: ChatContextEntry[]): string {
  return entries
    .map((entry) => `[出典${entry.index}: ${entry.source.label}]\n${entry.text}`)
    .join("\n\n");
}
