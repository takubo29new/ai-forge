const MAX_CHUNK_LENGTH = 2000;

// Markdownの見出し(##/###)単位を第一境界としてチャンク分割する。
// 見出し単位にする理由は、設計書の1セクションが意味的にまとまった単位であり、
// 検索結果をそのまま出典として提示しやすいため(docs/phases/phase3-design.md参照)。
// 1チャンクが長すぎる場合はさらに段落(空行区切り)単位で分割する。
export function chunkMarkdown(content: string): string[] {
  return splitByHeading(content)
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .flatMap((section) =>
      section.length <= MAX_CHUNK_LENGTH
        ? [section]
        : splitByParagraph(section, MAX_CHUNK_LENGTH),
    );
}

function splitByHeading(content: string): string[] {
  const lines = content.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }
  return sections;
}

function splitByParagraph(section: string, maxLength: number): string[] {
  const paragraphs = section.split(/\n{2,}/);
  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxLength && buffer) {
      chunks.push(buffer.trim());
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim().length > 0) {
    chunks.push(buffer.trim());
  }
  return chunks;
}
