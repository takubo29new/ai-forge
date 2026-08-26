import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  const userId = await requireUserId();

  const [repositories, examplePrompt] = await Promise.all([
    prisma.repository.findMany({
      where: { userId },
      orderBy: { connectedAt: "desc" },
      select: { id: true, owner: true, name: true },
    }),
    prisma.prompt.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { title: true },
    }),
  ]);

  // チャットからのAIレビュー実行(Phase 4項目4)は、リポジトリ・プロンプトの
  // 両方が揃って初めて使えるため、UI上の案内もこの条件を満たす場合のみ表示する
  // (docs/phase4-design.md「4. チャットからの直接アクション実行」参照)。
  const actionExample =
    repositories.length > 0 && examplePrompt
      ? {
          repositoryLabel: `${repositories[0].owner}/${repositories[0].name}`,
          promptTitle: examplePrompt.title,
        }
      : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <h1 className="mt-4 mb-2 text-xl font-semibold">RAG検索チャット</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        登録したドキュメントと、これまでのAIレビューの指摘から関連する内容を検索し、Claudeが根拠付きで回答します。会話履歴はこの画面を離れると失われます。
      </p>
      <ChatPanel
        repositories={repositories.map((r) => ({
          id: r.id,
          label: `${r.owner}/${r.name}`,
        }))}
        actionExample={actionExample}
      />
    </div>
  );
}
