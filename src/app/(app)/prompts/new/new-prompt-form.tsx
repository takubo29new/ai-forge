"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";
import { PROMPT_TEMPLATES } from "@/lib/prompt-templates";
import { INPUT_TYPE_LABEL, INPUT_TYPE_ICON, type EvaluationInputType } from "@/lib/evaluation-input-type";

const TEMPLATE_GROUPS: EvaluationInputType[] = ["IMAGE", "TEXT", "PDF"];

type Category = { id: string; name: string };

export function NewPromptForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [content, setContent] = useState("");
  const { mutate, pending, error } = useApiMutation();
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await mutate<{ id: string }>(
      "/api/prompts",
      { method: "POST", body: { title, categoryId: categoryId || null, content } },
      "作成に失敗しました",
    );
    if (!data) return;
    router.push(`/prompts/${data.id}`);
    showToast("プロンプトを作成しました");
  }

  function applyTemplate(template: (typeof PROMPT_TEMPLATES)[number]) {
    setTitle(template.title);
    setContent(template.content);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          テンプレートから始める(任意)
        </label>
        <p className="mb-2 text-xs text-zinc-500">
          AI評価(画像・テキスト・PDF)を試しやすくする叩き台です。選ぶとタイトル・本文が置き換わります(あとから自由に編集できます)。
        </p>
        <div className="flex flex-col gap-2">
          {TEMPLATE_GROUPS.map((group) => {
            const templates = PROMPT_TEMPLATES.filter((t) => t.inputTypeHint === group);
            if (templates.length === 0) return null;
            const GroupIcon = INPUT_TYPE_ICON[group];
            return (
              <div key={group} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  <GroupIcon className="h-3.5 w-3.5" />
                  {INPUT_TYPE_LABEL[group]}用:
                </span>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
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
        <label className="mb-1 block text-xs text-zinc-500">カテゴリ</label>
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
      <div>
        <label className="mb-1 block text-xs text-zinc-500">本文</label>
        <p className="mb-1.5 text-xs text-zinc-500">
          本文に{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono dark:bg-zinc-800">
            {"{{変数名}}"}
          </code>{" "}
          と書くと、実行時にその名前の入力欄が自動で表示されます。
        </p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={10}
          placeholder={"{{topic}}について、初心者向けに3行で説明してください。"}
          className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-accent transition-opacity hover:opacity-90 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        作成
      </button>
    </form>
  );
}
