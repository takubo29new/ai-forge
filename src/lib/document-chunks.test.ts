import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "./document-chunks";

describe("chunkMarkdown", () => {
  it("見出し(##)ごとにチャンクを分割する", () => {
    const content = [
      "# タイトル",
      "概要文",
      "",
      "## セクション1",
      "本文1",
      "",
      "## セクション2",
      "本文2",
    ].join("\n");

    const chunks = chunkMarkdown(content);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toContain("# タイトル");
    expect(chunks[0]).toContain("概要文");
    expect(chunks[1]).toContain("## セクション1");
    expect(chunks[1]).toContain("本文1");
    expect(chunks[2]).toContain("## セクション2");
    expect(chunks[2]).toContain("本文2");
  });

  it("###見出しでも分割する", () => {
    const content = ["## 大見出し", "本文", "### 小見出し", "詳細"].join("\n");

    const chunks = chunkMarkdown(content);

    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toContain("### 小見出し");
  });

  it("見出しが無い場合は1チャンクにまとめる", () => {
    const chunks = chunkMarkdown("ただの本文です。\n\n見出しはありません。");
    expect(chunks).toHaveLength(1);
  });

  it("空行だけの内容は空配列を返す", () => {
    expect(chunkMarkdown("\n\n   \n")).toEqual([]);
  });

  it("1セクションが長すぎる場合は段落単位でさらに分割する", () => {
    const longParagraph = "あ".repeat(1500);
    const content = [
      "## 長いセクション",
      longParagraph,
      "",
      longParagraph,
      "",
      longParagraph,
    ].join("\n");

    const chunks = chunkMarkdown(content);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000 + longParagraph.length);
    }
    // 分割後も内容が失われていないこと
    expect(chunks.join("")).toContain(longParagraph);
  });
});
