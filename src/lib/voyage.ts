const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

type VoyageInputType = "query" | "document";

type VoyageEmbeddingsResponse = {
  data: { embedding: number[]; index: number }[];
};

// Voyage AIのHTTPステータスを呼び出し元で判別できるようにするためのエラー型。
// 特に429(レート制限)は「もう一度お試しください」では解決しないことが多い
// (支払い方法未登録のアカウントは3RPM/10K TPMに制限される)ため、
// 呼び出し元でユーザーに具体的な案内を出し分ける。
export class VoyageApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VoyageApiError";
  }
}

// ドキュメント側はinput_type: "document"、質問側はinput_type: "query"を指定する。
// Voyage APIが非対称検索用に用意しているパラメータで、それぞれに最適化した
// 埋め込みが得られる(docs/phases/phase3-design.md参照)。
async function embed(
  texts: string[],
  inputType: VoyageInputType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new VoyageApiError(
      res.status,
      `Voyage AI embeddings request failed (${res.status}): ${body}`,
    );
  }

  const json = (await res.json()) as VoyageEmbeddingsResponse;
  return [...json.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embed([text], "query");
  return embedding;
}
