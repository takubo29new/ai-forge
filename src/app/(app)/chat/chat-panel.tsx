"use client";

import { useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";

type ChatSource =
  | { index: number; kind: "document_chunk"; label: string; documentId: string }
  | { index: number; kind: "review_comment"; label: string; reviewId: string };

type ChatTurn = {
  question: string;
  answer: string;
  sources: ChatSource[];
};

type ChatResponse = { answer: string; sources: ChatSource[] };

export function ChatPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  // 送信中に表示する質問文。inputはすぐ空にしたいので、表示用に別途保持する。
  const [pendingQuestion, setPendingQuestion] = useState("");
  const { mutate, pending, error } = useApiMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submitted = question.trim();
    if (!submitted) return;
    setQuestion("");
    setPendingQuestion(submitted);
    const data = await mutate<ChatResponse>(
      "/api/chat",
      { method: "POST", body: { question: submitted } },
      "回答の生成に失敗しました",
    );
    if (!data) return;
    setTurns((prev) => [
      ...prev,
      { question: submitted, answer: data.answer, sources: data.sources },
    ]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enterで送信、Shift+Enterで改行(一般的なチャット入力の操作感に合わせる)。
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        {turns.length === 0 && (
          <p className="rounded-lg border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
            まだ質問がありません。下の入力欄から質問してみてください。
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="text-sm font-medium">Q. {turn.question}</p>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <Markdown>{turn.answer}</Markdown>
              {turn.sources.length > 0 && (
                <div className="mt-3 flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500">出典</p>
                  <ul className="flex flex-col gap-0.5">
                    {turn.sources.map((source) => (
                      <li key={source.index} className="text-xs text-zinc-500">
                        [出典{source.index}]{" "}
                        {source.kind === "review_comment" ? (
                          <Link
                            href={`/reviews/${source.reviewId}`}
                            className="hover:underline"
                          >
                            {source.label}
                          </Link>
                        ) : (
                          source.label
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Q. {pendingQuestion}</p>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              <Spinner className="h-4 w-4" />
              回答を生成中...
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          required
          rows={2}
          placeholder="質問を入力(Enterで送信、Shift+Enterで改行)"
          className="flex-1 resize-none rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 self-stretch rounded bg-accent transition-opacity hover:opacity-90 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "考え中..." : "送信"}
        </button>
      </form>
    </div>
  );
}
