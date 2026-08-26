import type { EvaluationInputType } from "@/lib/evaluation-input-type";

// /prompts/newの「テンプレートから始める」向けの叩き台プロンプト集。
// 主にPhase 5(AI評価)を試しやすくする目的のため、画像・テキスト・PDF
// 入力の評価用途を中心に用意する(docs/phase5-design.md「今後の拡張候補」参照)。
// DBには保存せず、静的なリストからタイトル・本文をフォームに反映するだけの
// シンプルな仕組みにしている(専用モデル・APIは追加しない)。
export type PromptTemplate = {
  id: string;
  label: string;
  inputTypeHint: EvaluationInputType;
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
    id: "interior-photo",
    label: "部屋・インテリアの評価",
    inputTypeHint: "IMAGE",
    title: "部屋の写真の評価",
    content:
      "この部屋の写真を評価してください。整理整頓・配色の統一感・動線の3つの観点でコメントし、改善案を1つずつ提案してください。",
  },
  {
    id: "muscle-photo",
    label: "筋肉の評価",
    inputTypeHint: "IMAGE",
    title: "筋肉の評価",
    content:
      "この写真を見て、筋肉の発達度合いを評価してください。写真に写っている部位(胸・背中・肩・腕・脚など)ごとにコメントし、100点満点の総合スコアも付けてください。医学的な診断ではなく、トレーニングの参考として使う想定です。",
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
  {
    id: "business-email",
    label: "ビジネスメール文面のチェック",
    inputTypeHint: "TEXT",
    title: "ビジネスメールのチェック",
    content:
      "次のビジネスメールの文面を確認してください: {{email}}\n\n敬語・丁寧さ・簡潔さの3つの観点で問題があれば指摘し、修正案の文面も提示してください。",
  },
  {
    id: "resume-pdf",
    label: "履歴書・職務経歴書の添削",
    inputTypeHint: "PDF",
    title: "履歴書の添削",
    content:
      "このPDFの履歴書・職務経歴書を添削してください。実績の伝わりやすさ・記載の一貫性・誤字脱字の3つの観点でコメントし、改善案を提案してください。",
  },
  {
    id: "contract-pdf",
    label: "契約書の要点整理",
    inputTypeHint: "PDF",
    title: "契約書の要点整理",
    content:
      "このPDFの契約書を確認してください。重要な条項の要約、注意すべき点、不明瞭・一方的に見える箇所があればそれぞれコメントしてください(法的助言ではなく、読み解きの補助として使う想定です)。",
  },
  {
    id: "paper-pdf",
    label: "論文・レポートの評価",
    inputTypeHint: "PDF",
    title: "論文・レポートの評価",
    content:
      "このPDFの論文・レポートを評価してください。論旨の一貫性・根拠の妥当性・文章の分かりやすさの3つの観点でコメントし、改善案を提案してください。",
  },
];
