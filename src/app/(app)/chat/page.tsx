import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  const userId = await requireUserId();

  const repositories = await prisma.repository.findMany({
    where: { userId },
    orderBy: { connectedAt: "desc" },
    select: { id: true, owner: true, name: true },
  });

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
      />
    </div>
  );
}
