export type EvaluationInputType = "IMAGE" | "TEXT" | "PDF";

export const INPUT_TYPE_LABEL: Record<EvaluationInputType, string> = {
  IMAGE: "画像",
  TEXT: "テキスト",
  PDF: "PDF",
};
