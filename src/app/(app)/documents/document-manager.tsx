"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";

type Document = {
  id: string;
  title: string;
  sourceType: "MANUAL" | "REPO_FILE";
  chunkCount: number;
  createdAt: string;
};

const SOURCE_TYPE_LABEL: Record<Document["sourceType"], string> = {
  MANUAL: "手動登録",
  REPO_FILE: "リポジトリ同期",
};

export function DocumentManager({
  initialDocuments,
}: {
  initialDocuments: Document[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const { mutate, pending, error, setError } = useApiMutation();
  const backfill = useApiMutation();
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const sync = useApiMutation();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function handleSync() {
    setSyncMessage(null);
    const data = await sync.mutate<{ syncedDocuments: number; syncedChunks: number }>(
      "/api/documents/sync",
      { method: "POST" },
      "同期に失敗しました",
    );
    if (!data) return;
    setSyncMessage(
      `${data.syncedDocuments}件のファイルを同期しました(${data.syncedChunks}チャンク)`,
    );
    // 同期はサーバー側で複数のDocumentを一括作り直すため、個々の差分を
    // クライアント側で組み立てるより一覧を取得し直す方が単純で確実。
    const res = await fetch("/api/documents");
    if (res.ok) {
      const raw: {
        id: string;
        title: string;
        sourceType: Document["sourceType"];
        createdAt: string;
        _count: { chunks: number };
      }[] = await res.json();
      setDocuments(
        raw.map((d) => ({
          id: d.id,
          title: d.title,
          sourceType: d.sourceType,
          chunkCount: d._count.chunks,
          createdAt: d.createdAt,
        })),
      );
    }
  }

  async function handleBackfill() {
    setBackfillMessage(null);
    let totalProcessed = 0;
    for (;;) {
      const data = await backfill.mutate<{ processed: number; remaining: boolean }>(
        "/api/review-comments/backfill-embeddings",
        { method: "POST" },
        "埋め込みの更新に失敗しました",
      );
      if (!data) return;
      totalProcessed += data.processed;
      if (!data.remaining) break;
    }
    setBackfillMessage(
      totalProcessed > 0
        ? `${totalProcessed}件のレビュー指摘に埋め込みを追加しました`
        : "未処理のレビュー指摘はありませんでした",
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = await mutate<{ id: string; title: string; chunkCount: number }>(
      "/api/documents",
      { method: "POST", body: { title, content } },
      "登録に失敗しました",
    );
    if (!data) return;
    setDocuments((prev) => [
      {
        id: data.id,
        title: data.title,
        sourceType: "MANUAL",
        chunkCount: data.chunkCount,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTitle("");
    setContent("");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;

    const result = await mutate(
      `/api/documents/${target.id}`,
      { method: "DELETE" },
      "削除に失敗しました",
    );
    if (result === null) return;
    setDocuments((prev) => prev.filter((d) => d.id !== target.id));
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-sm font-medium">ai-forgeの設計書を同期</p>
        <p className="mb-3 text-xs text-zinc-500">
          このai-forgeプロジェクト自身のdocs/配下のMarkdownファイル・README.md・ai-dev-tool-handoff.mdを取り込みます(GitHubで接続した他のリポジトリではなく、今動いているこのアプリ自身のファイルが対象です)。再度実行すると、同じファイルのドキュメントは最新の内容で作り直されます。
        </p>
        <button
          onClick={handleSync}
          disabled={sync.pending}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          {sync.pending && <Spinner className="h-3.5 w-3.5" />}
          {sync.pending ? "同期中..." : "設計書を同期"}
        </button>
        {syncMessage && (
          <p className="mt-2 text-xs text-zinc-500">{syncMessage}</p>
        )}
        {sync.error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {sync.error}
          </p>
        )}
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div>
          <label className="mb-1 block text-xs text-zinc-500">タイトル</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            本文(Markdown可。見出し単位でチャンク分割されます)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={8}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 self-start rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "登録中..." : "登録"}
        </button>
      </form>

      {error && !deleteTarget && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {documents.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">
            ドキュメントがまだありません
          </li>
        )}
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{document.title}</p>
              <p className="text-xs text-zinc-500">
                {SOURCE_TYPE_LABEL[document.sourceType]} ・{" "}
                {document.chunkCount}チャンク
              </p>
            </div>
            <button
              onClick={() => setDeleteTarget(document)}
              disabled={pending}
              className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
            >
              削除
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="mb-2 text-sm font-medium">レビュー指摘の埋め込み</p>
        <p className="mb-3 text-xs text-zinc-500">
          過去のAIレビュー指摘をRAG検索チャットの検索対象にするための埋め込みを生成します。新しく実行したレビューは自動で対象になるため、既存分を一度取り込むためのボタンです。
        </p>
        <button
          onClick={handleBackfill}
          disabled={backfill.pending}
          className="inline-flex items-center gap-1.5 rounded border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          {backfill.pending && <Spinner className="h-3.5 w-3.5" />}
          {backfill.pending ? "処理中..." : "既存のレビュー指摘を取り込む"}
        </button>
        {backfillMessage && (
          <p className="mt-2 text-xs text-zinc-500">{backfillMessage}</p>
        )}
        {backfill.error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {backfill.error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ドキュメントを削除"
        message={
          deleteTarget
            ? `「${deleteTarget.title}」を削除します。関連するチャンク・埋め込みもすべて削除されます。よろしいですか?`
            : ""
        }
        confirmLabel="削除"
        danger
        pending={pending}
        error={deleteTarget ? error : null}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setError(null);
        }}
      />
    </div>
  );
}
