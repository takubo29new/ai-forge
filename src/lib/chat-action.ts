import { anthropic } from "@/lib/anthropic";
import type { ChatActionProposal } from "@/lib/chat-context";

// 意図解析専用の軽量モデル。回答生成(DEFAULT_MODEL)と違い、単純な分類+
// パラメータ抽出のタスクのため、コストの低いモデルで十分と判断した。
const INTENT_MODEL = "claude-haiku-4-5";

const PROPOSE_REVIEW_TOOL = {
  name: "propose_review_execution",
  description:
    "ユーザーが「保存済みプロンプトを使ってPRのAIレビューを実行してほしい」という明確な実行依頼をしている場合にのみ呼び出す。対象のリポジトリ・PR番号・使用するプロンプトの全てが本文または直前の文脈から特定できる場合のみ呼び出し、単なる質問・雑談・パラメータが曖昧な依頼では呼び出さないこと。",
  input_schema: {
    type: "object" as const,
    properties: {
      repositoryId: {
        type: "string" as const,
        description: "対象リポジトリのID(下記の利用可能なリポジトリ一覧から選ぶ)",
      },
      pullRequestNumber: {
        type: "integer" as const,
        description: "レビュー対象のPR番号",
      },
      promptId: {
        type: "string" as const,
        description: "使用するプロンプトのID(下記の利用可能なプロンプト一覧から選ぶ)",
      },
    },
    required: ["repositoryId", "pullRequestNumber", "promptId"],
  },
};

type RepositoryOption = { id: string; owner: string; name: string };
type PromptOption = { id: string; title: string };

function isToolUseBlock(
  block: unknown,
): block is { type: "tool_use"; name: string; input: unknown } {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: unknown }).type === "tool_use"
  );
}

// ユーザーの発話をtool useで解析し、レビュー実行の提案を組み立てる。
// リポジトリ・プロンプトを1件も持たないユーザーには実行しようがないため
// 呼び出し元でスキップする想定(このモジュール内ではガードしない)。
export async function detectReviewActionIntent(
  question: string,
  repositories: RepositoryOption[],
  prompts: PromptOption[],
): Promise<ChatActionProposal | null> {
  const system = [
    "あなたはAI開発支援ツールのアシスタントです。ユーザーの発話を解析し、",
    "保存済みプロンプトを使ったPRのAIレビュー実行を明確に依頼している場合のみ",
    "propose_review_executionツールを呼び出してください。それ以外(質問・雑談・",
    "対象が曖昧な依頼)ではツールを呼び出さず、何も出力しないでください。",
    "",
    "# 利用可能なリポジトリ",
    repositories.map((r) => `- id=${r.id}: ${r.owner}/${r.name}`).join("\n"),
    "",
    "# 利用可能なプロンプト",
    prompts.map((p) => `- id=${p.id}: ${p.title}`).join("\n"),
  ].join("\n");

  const message = await anthropic.messages.create({
    model: INTENT_MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: "user", content: question }],
    tools: [PROPOSE_REVIEW_TOOL],
  });

  const toolUse = message.content.find(
    (block) => isToolUseBlock(block) && block.name === "propose_review_execution",
  );
  if (!toolUse || !isToolUseBlock(toolUse)) return null;

  const input = toolUse.input;
  if (typeof input !== "object" || input === null) return null;
  const { repositoryId, pullRequestNumber, promptId } = input as Record<string, unknown>;

  // Claudeがシステムプロンプトに無いIDを幻視する可能性があるため、実在する
  // 選択肢の中から選ばれたものだけを提案として採用する(それ以外は無視して
  // 通常のRAG回答フローにフォールバックさせる)。
  const repository = repositories.find((r) => r.id === repositoryId);
  const prompt = prompts.find((p) => p.id === promptId);
  if (
    !repository ||
    !prompt ||
    typeof pullRequestNumber !== "number" ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    return null;
  }

  return {
    repositoryId: repository.id,
    repositoryLabel: `${repository.owner}/${repository.name}`,
    pullRequestNumber,
    promptId: prompt.id,
    promptLabel: prompt.title,
  };
}
