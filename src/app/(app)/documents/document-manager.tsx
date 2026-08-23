"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";

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
          className="self-start rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
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
              className="shrink-0 rounded border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
            >
              削除
            </button>
          </li>
        ))}
      </ul>

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
