"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";
import { submitOnModEnter } from "@/lib/keyboard-shortcuts";

type Category = { id: string; name: string };

export function EditTab({
  promptId,
  title: initialTitle,
  categoryId: initialCategoryId,
  content: initialContent,
  versionNumber,
  categories,
}: {
  promptId: string;
  title: string;
  categoryId: string | null;
  content: string;
  versionNumber: number;
  categories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "");
  const [content, setContent] = useState(initialContent);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { mutate, pending, error, setError } = useApiMutation();
  const { showToast } = useToast();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const data = await mutate(
      `/api/prompts/${promptId}`,
      { method: "PATCH", body: { title, categoryId: categoryId || null, content, note } },
      "保存に失敗しました",
    );
    if (!data) return;
    setNote("");
    router.refresh();
    showToast("新しいバージョンとして保存しました");
  }

  async function handleDelete() {
    const result = await mutate(
      `/api/prompts/${promptId}`,
      { method: "DELETE" },
      "削除に失敗しました",
    );
    if (result === null) return;
    setConfirmDelete(false);
    router.push("/prompts");
    showToast("プロンプトを削除しました");
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">
            タイトル
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="w-full sm:w-48">
          <label className="mb-1 block text-xs text-zinc-500">
            カテゴリ
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">未分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-500">現在のバージョン: v{versionNumber}</p>

      <p className="text-xs text-zinc-500">
        本文に{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
          {"{{変数名}}"}
        </code>{" "}
        と書くと、実行時にその名前の入力欄が自動で表示されます(例:{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
          {"{{topic}}について説明してください"}
        </code>
        )。AIレビューに使うプロンプトの場合は、PRの差分を受け取るために必ず{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
          {"{{diff}}"}
        </code>{" "}
        を含めてください。
      </p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={submitOnModEnter}
        required
        rows={14}
        className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <p className="-mt-2 text-xs text-zinc-500">Ctrl/⌘+Enterで保存できます</p>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          更新メモ(任意)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent transition-opacity hover:opacity-90 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          新しいバージョンとして保存
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={pending}
          className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          削除
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="プロンプトを削除"
        message={`「${title}」を削除します。バージョン履歴・実行履歴もすべて削除されます。よろしいですか?`}
        confirmLabel="削除"
        danger
        pending={pending}
        error={confirmDelete ? error : null}
        onConfirm={handleDelete}
        onCancel={() => {
          setConfirmDelete(false);
          setError(null);
        }}
      />
    </form>
  );
}
