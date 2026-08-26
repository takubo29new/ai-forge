"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast-provider";
import { usePendingEvaluations } from "@/components/pending-evaluations-context";

type EvaluationStatus = "PENDING" | "SUCCESS" | "FAILED";

type Evaluation = {
  id: string;
  title: string;
  status: EvaluationStatus;
  findingCount: number;
  createdAt: string;
};

type Prompt = { id: string; title: string };

const STATUS_TEXT: Record<EvaluationStatus, string> = {
  PENDING: "処理中",
  SUCCESS: "成功",
  FAILED: "失敗",
};

// Claude Vision向けの簡易な事前チェック。厳密な上限はAPI側の判定に委ね、
// ここでは明らかに大きすぎるファイルを早期に弾くだけに留める。
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像の読み込みに失敗しました"));
        return;
      }
      // data:image/png;base64,xxxx... のうちbase64本体だけを取り出す
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

export function EvaluationManager({
  initialEvaluations,
  prompts,
}: {
  initialEvaluations: Evaluation[];
  prompts: Prompt[];
}) {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState(initialEvaluations);
  const [title, setTitle] = useState("");
  const [promptId, setPromptId] = useState(prompts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Evaluation | null>(null);
  const [reading, setReading] = useState(false);
  const { mutate, pending, error, setError } = useApiMutation();
  const del = useApiMutation();
  const { showToast } = useToast();
  const { registerPending } = usePendingEvaluations();
  // pendingはmutate()呼び出し以降しかtrueにならないため、それより前段の
  // ファイル読み込み中もあわせてガードしないと二重送信を防げない。
  const busy = pending || reading;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) {
      setError("画像を選択してください");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("画像サイズが大きすぎます(5MB以下にしてください)");
      return;
    }

    setReading(true);
    let imageBase64: string;
    try {
      imageBase64 = await readFileAsBase64(file);
    } catch {
      setError("画像の読み込みに失敗しました");
      setReading(false);
      return;
    }
    setReading(false);

    const data = await mutate<{ id: string }>(
      "/api/evaluations",
      {
        method: "POST",
        body: { title, promptId, imageBase64, imageMediaType: file.type },
      },
      "評価の実行に失敗しました",
    );
    if (!data) return;
    // 実際のAI呼び出しはバックグラウンドで進むため、ここではまだPENDING。
    // 完了はレイアウトに常駐するPendingEvaluationsProviderがポーリングして
    // トースト通知する(docs/phase5-design.md「バックグラウンド処理」参照)。
    registerPending(data.id);
    router.push(`/evaluations/${data.id}`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const result = await del.mutate(
      `/api/evaluations/${target.id}`,
      { method: "DELETE" },
      "削除に失敗しました",
    );
    if (result === null) return;
    setEvaluations((prev) => prev.filter((e) => e.id !== target.id));
    setDeleteTarget(null);
    showToast("評価を削除しました");
  }

  if (prompts.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        評価に使うプロンプトがまだありません。先にプロンプトを作成してください。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-500">新規評価</h2>
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
              placeholder="例: 今日の夕食"
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">プロンプト</label>
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">画像</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 self-start rounded bg-accent transition-opacity hover:opacity-90 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Spinner className="h-4 w-4" />}
            {busy ? "評価中..." : "評価を実行"}
          </button>
          {error && !deleteTarget && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-500">
          評価履歴({evaluations.length}件)
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {evaluations.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">
              評価履歴がまだありません
            </li>
          )}
          {evaluations.map((evaluation) => (
            <li
              key={evaluation.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <Link href={`/evaluations/${evaluation.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium hover:underline">
                  {evaluation.title}
                </p>
                <p className="text-xs text-zinc-500">
                  {new Date(evaluation.createdAt).toLocaleString("ja-JP")} ・{" "}
                  {STATUS_TEXT[evaluation.status]}
                  {evaluation.status === "SUCCESS" &&
                    ` ・ ${evaluation.findingCount}件のコメント`}
                </p>
              </Link>
              <button
                onClick={() => setDeleteTarget(evaluation)}
                disabled={del.pending}
                className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="評価を削除"
        message={
          deleteTarget ? `「${deleteTarget.title}」を削除します。よろしいですか?` : ""
        }
        confirmLabel="削除"
        danger
        pending={del.pending}
        error={deleteTarget ? del.error : null}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          del.setError(null);
        }}
      />
    </div>
  );
}
