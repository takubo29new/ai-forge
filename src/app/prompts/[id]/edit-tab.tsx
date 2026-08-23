"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/prompts/${promptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          categoryId: categoryId || null,
          content,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました");
        return;
      }
      setNote("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`「${title}」を削除します。よろしいですか?`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/prompts/${promptId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "削除に失敗しました");
        return;
      }
      router.push("/prompts");
    } finally {
      setPending(false);
    }
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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
        rows={14}
        className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

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
          className="rounded-full bg-foreground px-6 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          新しいバージョンとして保存
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
        >
          削除
        </button>
      </div>
    </form>
  );
}
