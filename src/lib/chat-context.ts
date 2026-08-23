import type {
  DocumentChunkSearchHit,
  ReviewCommentSearchHit,
} from "@/lib/embeddings";

type SearchHit = DocumentChunkSearchHit | ReviewCommentSearchHit;

export type ChatSource =
  | { kind: "document_chunk"; label: string; documentId: string }
  | { kind: "review_comment"; label: string; reviewId: string };

export type ChatContextEntry = {
  index: number;
  text: string;
  source: ChatSource;
};

// DocumentChunk・ReviewComment2つの検索結果をコサイン距離でマージし、
// 上位limit件をClaudeへ渡す文脈として整形する。
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
      return {
        index: i + 1,
        text: hit.body,
        source: {
          kind: "review_comment",
          label: `PR #${hit.pullRequestNumber} ${hit.pullRequestTitle}(${hit.filePath})`,
          reviewId: hit.reviewId,
        },
      };
    });
}

export function renderContextForPrompt(entries: ChatContextEntry[]): string {
  return entries
    .map((entry) => `[出典${entry.index}: ${entry.source.label}]\n${entry.text}`)
    .join("\n\n");
}
