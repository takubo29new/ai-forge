"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast-provider";
import { usePendingEvaluations } from "@/components/pending-evaluations-context";
import { extractVariableNames } from "@/lib/prompt-variables";
import { submitOnModEnter } from "@/lib/keyboard-shortcuts";
import { INPUT_TYPE_LABEL, type EvaluationInputType } from "@/lib/evaluation-input-type";

type EvaluationStatus = "PENDING" | "SUCCESS" | "FAILED";
type InputType = EvaluationInputType;

type Evaluation = {
  id: string;
  title: string;
  status: EvaluationStatus;
  inputType: InputType;
  findingCount: number;
  createdAt: string;
};

type Prompt = { id: string; title: string; content: string };

const STATUS_TEXT: Record<EvaluationStatus, string> = {
  PENDING: "処理中",
  SUCCESS: "成功",
  FAILED: "失敗",
};

// Claude Vision/ドキュメント入力向けの簡易な事前チェック。厳密な上限はAPI側の
// 判定に委ね、ここでは明らかに大きすぎるファイルを早期に弾くだけに留める。
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("ファイルの読み込みに失敗しました"));
        return;
      }
      // data:image/png;base64,xxxx... のうちbase64本体だけを取り出す
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
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
  const [inputType, setInputType] = useState<InputType>("IMAGE");
  const [file, setFile] = useState<File | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Evaluation | null>(null);
  const [reading, setReading] = useState(false);
  const { mutate, pending, error, setError } = useApiMutation();
  const del = useApiMutation();
  const { showToast } = useToast();
  const { registerPending } = usePendingEvaluations();
  // pendingはmutate()呼び出し以降しかtrueにならないため、それより前段の
  // ファイル読み込み中もあわせてガードしないと二重送信を防げない。
  const busy = pending || reading;

  const selectedPrompt = prompts.find((p) => p.id === promptId);
  // テキスト評価は既存のプロンプト実行(execute-tab.tsx)と同じ{{変数名}}展開を
  // 使う(docs/phase5-design.md「対応する入力形式」参照)。歌詞・楽譜のテキスト化
  // した楽曲・文章など、内容が長くなりうるためtextareaで受け付ける。
  const variableNames = useMemo(
    () => (selectedPrompt ? extractVariableNames(selectedPrompt.content) : []),
    [selectedPrompt],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    let data: { id: string } | null;
    if (inputType === "IMAGE" || inputType === "PDF") {
      if (!file) {
        setError(inputType === "IMAGE" ? "画像を選択してください" : "PDFファイルを選択してください");
        return;
      }
      const maxBytes = inputType === "IMAGE" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
      if (file.size > maxBytes) {
        setError(
          inputType === "IMAGE"
            ? "画像サイズが大きすぎます(5MB以下にしてください)"
            : "PDFサイズが大きすぎます(20MB以下にしてください)",
        );
        return;
      }

      setReading(true);
      let base64: string;
      try {
        base64 = await readFileAsBase64(file);
      } catch {
        setError("ファイルの読み込みに失敗しました");
        setReading(false);
        return;
      }
      setReading(false);

      data = await mutate<{ id: string }>(
        "/api/evaluations",
        {
          method: "POST",
          body:
            inputType === "IMAGE"
              ? { title, promptId, inputType: "IMAGE", imageBase64: base64, imageMediaType: file.type }
              : { title, promptId, inputType: "PDF", pdfBase64: base64 },
        },
        "評価の実行に失敗しました",
      );
    } else {
      data = await mutate<{ id: string }>(
        "/api/evaluations",
        {
          method: "POST",
          body: { title, promptId, inputType: "TEXT", variables: variableValues },
        },
        "評価の実行に失敗しました",
      );
    }
    if (!data) return;
    // 実際のAI呼び出しはバックグラウンドで進むため、ここではまだPENDING。
    // 完了はレイアウトに常駐するPendingEvaluationsProviderがポーリングして
    // トースト通知する(docs/phase5-design.md「バックグラウンド処理」参照)。
    registerPending(data.id);
    router.push(`/evaluations/${data.id}`);
  }

  // 入力形式を切り替えるたびにfileをリセットする。選択済みのファイルを
  // 保持したまま形式だけ変わると、別形式のファイルがそのまま送信されうるため。
  function handleInputTypeChange(next: InputType) {
    setInputType(next);
    setFile(null);
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
            <label className="mb-1 block text-xs text-zinc-500">入力形式</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="inputType"
                  checked={inputType === "IMAGE"}
                  onChange={() => handleInputTypeChange("IMAGE")}
                />
                画像
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="inputType"
                  checked={inputType === "TEXT"}
                  onChange={() => handleInputTypeChange("TEXT")}
                />
                テキスト
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="inputType"
                  checked={inputType === "PDF"}
                  onChange={() => handleInputTypeChange("PDF")}
                />
                PDF
              </label>
            </div>
          </div>
          {inputType === "IMAGE" ? (
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
          ) : inputType === "PDF" ? (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">PDFファイル</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="w-full text-sm"
              />
            </div>
          ) : variableNames.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-500">
                評価対象のテキスト(プロンプト本文の{"{{変数名}}"}に埋め込まれます、Ctrl/⌘+Enterで実行できます)
              </p>
              {variableNames.map((name) => (
                <div key={name}>
                  <label className="mb-1 block text-xs text-zinc-500">{name}</label>
                  <textarea
                    value={variableValues[name] ?? ""}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    onKeyDown={submitOnModEnter}
                    rows={4}
                    className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              選択したプロンプトに{"{{変数名}}"}が含まれていないため、テキストを埋め込む箇所がありません。プロンプトを編集するか、他のプロンプトを選んでください。
            </p>
          )}
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
                  {INPUT_TYPE_LABEL[evaluation.inputType]} ・{" "}
                  {STATUS_TEXT[evaluation.status]}
                  {evaluation.status === "SUCCESS" &&
                    ` ・ ${evaluation.findingCount}件のコメント`}
                </p>
              </Link>
              <button
                onClick={() => setDeleteTarget(evaluation)}
                disabled={del.pending}
                className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
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
