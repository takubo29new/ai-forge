"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Category = {
  id: string;
  name: string;
  description: string | null;
  promptCount: number;
};

export function CategoryManager({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "作成に失敗しました");
        return;
      }
      setCategories((prev) => [...prev, { ...data, promptCount: 0 }]);
      setNewName("");
      setNewDescription("");
    } finally {
      setPending(false);
    }
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
    setError(null);
  }

  async function handleUpdate(id: string) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "更新に失敗しました");
        return;
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data } : c)),
      );
      setEditingId(null);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const category = deleteTarget;

    setError(null);
    setPending(true);
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "削除に失敗しました");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">
            新規カテゴリ名
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">
            説明(任意)
          </label>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          追加
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {categories.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">
            カテゴリがまだありません
          </li>
        )}
        {categories.map((category) => (
          <li key={category.id} className="px-4 py-3">
            {editingId === category.id ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="説明(任意)"
                  className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(category.id)}
                    disabled={pending}
                    className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {category.name}
                    <span className="ml-2 text-xs text-zinc-500">
                      ({category.promptCount}件)
                    </span>
                  </p>
                  {category.description && (
                    <p className="text-xs text-zinc-500">
                      {category.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => startEdit(category)}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setDeleteTarget(category)}
                    disabled={pending}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="カテゴリを削除"
        message={
          deleteTarget
            ? deleteTarget.promptCount > 0
              ? `「${deleteTarget.name}」を削除します。この操作で${deleteTarget.promptCount}件のプロンプトが未分類になります。よろしいですか?`
              : `「${deleteTarget.name}」を削除します。よろしいですか?`
            : ""
        }
        confirmLabel="削除"
        danger
        pending={pending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
