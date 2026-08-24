"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const { mutate, pending, error, setError } = useApiMutation();
  const { showToast } = useToast();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = await mutate<Category>(
      "/api/categories",
      { method: "POST", body: { name: newName, description: newDescription } },
      "作成に失敗しました",
    );
    if (!data) return;
    setCategories((prev) => [...prev, { ...data, promptCount: 0 }]);
    setNewName("");
    setNewDescription("");
    showToast("カテゴリを作成しました");
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description ?? "");
    setError(null);
  }

  async function handleUpdate(id: string) {
    const data = await mutate<Category>(
      `/api/categories/${id}`,
      { method: "PATCH", body: { name: editName, description: editDescription } },
      "更新に失敗しました",
    );
    if (!data) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    setEditingId(null);
    showToast("カテゴリを更新しました");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const category = deleteTarget;

    const result = await mutate(
      `/api/categories/${category.id}`,
      { method: "DELETE" },
      "削除に失敗しました",
    );
    if (result === null) return;
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    setDeleteTarget(null);
    showToast("カテゴリを削除しました");
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
          className="rounded bg-accent transition-opacity hover:opacity-90 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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
                    className="rounded bg-accent transition-opacity hover:opacity-90 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
                    className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
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
