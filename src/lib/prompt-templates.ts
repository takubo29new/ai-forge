// /prompts/newの「テンプレートから始める」向けの叩き台プロンプト集。
// 主にPhase 5(AI評価)を試しやすくする目的のため、画像・テキスト入力の
// 評価用途を中心に用意する(docs/phase5-design.md「今後の拡張候補」参照)。
// DBには保存せず、静的なリストからタイトル・本文をフォームに反映するだけの
// シンプルな仕組みにしている(専用モデル・APIは追加しない)。
export type PromptTemplate = {
  id: string;
  label: string;
  inputTypeHint: "IMAGE" | "TEXT";
  title: string;
  content: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "food-photo",
    label: "料理写真の評価",
    inputTypeHint: "IMAGE",
    title: "料理写真の評価",
    content:
      "この料理の写真を評価してください。彩り・栄養バランス・盛り付けの3つの観点でそれぞれコメントし、100点満点の総合スコアも付けてください。",
  },
  {
    id: "illustration",
    label: "自作イラストの評価",
    inputTypeHint: "IMAGE",
    title: "イラストの評価",
    content:
      "この絵を評価してください。構図・配色・画力の3つの観点で良い点と改善点をそれぞれ挙げてください。初心者にも分かりやすい言葉で説明してください。",
  },
  {
    id: "lyrics",
    label: "歌詞の評価",
    inputTypeHint: "TEXT",
    title: "歌詞の評価",
    content:
      "次の歌詞を評価してください: {{lyrics}}\n\n情感・韻律・テーマの一貫性の3つの観点でコメントしてください。",
  },
  {
    id: "essay",
    label: "文章・エッセイの評価",
    inputTypeHint: "TEXT",
    title: "文章の評価",
    content:
      "次の文章を評価してください: {{text}}\n\n構成・説得力・読みやすさの3つの観点でコメントし、それぞれ改善案を1つずつ提案してください。",
  },
];
