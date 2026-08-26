"use client";

import { useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { useApiMutation } from "@/lib/use-api-mutation";
import { Spinner } from "@/components/spinner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ChatActionProposal, ChatSource } from "@/lib/chat-context";

type IndexedChatSource = { index: number } & ChatSource;

type ChatTurn =
  | { kind: "answer"; question: string; answer: string; sources: IndexedChatSource[] }
  | {
      kind: "action";
      question: string;
      proposal: ChatActionProposal;
      status: "pending" | "confirmed" | "cancelled";
      reviewId?: string;
    };

type ChatResponse =
  | { answer: string; sources: IndexedChatSource[] }
  | { actionProposal: ChatActionProposal };

type RepositoryOption = { id: string; label: string };
type ActionExample = { repositoryLabel: string; promptTitle: string };

export function ChatPanel({
  repositories,
  actionExample,
}: {
  repositories: RepositoryOption[];
  actionExample: ActionExample | null;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  // 送信中に表示する質問文。inputはすぐ空にしたいので、表示用に別途保持する。
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const { mutate, pending, error } = useApiMutation();
  // 確認待ちのアクションが紐づくturnsのインデックス(同時に1件のみ想定)。
  const [pendingActionIndex, setPendingActionIndex] = useState<number | null>(null);
  const {
    mutate: mutateAction,
    pending: actionPending,
    error: actionError,
    setError: setActionError,
  } = useApiMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submitted = question.trim();
    if (!submitted) return;
    setQuestion("");
    setPendingQuestion(submitted);
    const data = await mutate<ChatResponse>(
      "/api/chat",
      {
        method: "POST",
        body: repositoryId
          ? { question: submitted, repositoryId }
          : { question: submitted },
      },
      "回答の生成に失敗しました",
    );
    if (!data) return;
    if ("actionProposal" in data) {
      setTurns((prev) => {
        setPendingActionIndex(prev.length);
        return [
          ...prev,
          {
            kind: "action",
            question: submitted,
            proposal: data.actionProposal,
            status: "pending",
          },
        ];
      });
      return;
    }
    setTurns((prev) => [
      ...prev,
      { kind: "answer", question: submitted, answer: data.answer, sources: data.sources },
    ]);
  }

  const pendingAction =
    pendingActionIndex !== null ? turns[pendingActionIndex] : undefined;

  async function handleConfirmAction() {
    if (pendingActionIndex === null || pendingAction?.kind !== "action") return;
    const { proposal } = pendingAction;
    const data = await mutateAction<{ id: string }>(
      `/api/repositories/${proposal.repositoryId}/reviews`,
      {
        method: "POST",
        body: {
          pullRequestNumber: proposal.pullRequestNumber,
          promptId: proposal.promptId,
        },
      },
      "レビューの実行に失敗しました",
    );
    if (!data) return;
    const index = pendingActionIndex;
    setTurns((prev) =>
      prev.map((turn, i) =>
        i === index && turn.kind === "action"
          ? { ...turn, status: "confirmed", reviewId: data.id }
          : turn,
      ),
    );
    setPendingActionIndex(null);
  }

  function handleCancelAction() {
    if (pendingActionIndex === null) return;
    const index = pendingActionIndex;
    setTurns((prev) =>
      prev.map((turn, i) =>
        i === index && turn.kind === "action" ? { ...turn, status: "cancelled" } : turn,
      ),
    );
    setActionError(null);
    setPendingActionIndex(null);
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
      {repositories.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500" htmlFor="chat-repository-filter">
            対象リポジトリ
          </label>
          <select
            id="chat-repository-filter"
            value={repositoryId}
            onChange={(e) => setRepositoryId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">すべて</option>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {turns.length === 0 && (
          <p className="rounded-lg border border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
            まだ質問がありません。下の入力欄から質問してみてください。
          </p>
        )}
        {turns.map((turn, i) =>
          turn.kind === "action" ? (
            <div key={i} className="flex flex-col gap-2">
              <p className="text-sm font-medium">Q. {turn.question}</p>
              <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                <p>次の操作の実行を提案します。</p>
                <p className="mt-1 font-medium">
                  {turn.proposal.repositoryLabel} の PR #{turn.proposal.pullRequestNumber} を、
                  プロンプト「{turn.proposal.promptLabel}」でレビュー
                </p>
                {turn.status === "cancelled" && (
                  <p className="mt-2 text-xs text-zinc-500">キャンセルしました。</p>
                )}
                {turn.status === "confirmed" && turn.reviewId && (
                  <p className="mt-2 text-xs">
                    <Link href={`/reviews/${turn.reviewId}`} className="hover:underline">
                      レビュー結果を見る →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          ) : (
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
                          ) : source.kind === "prompt_version" || source.kind === "execution" ? (
                            <Link
                              href={`/prompts/${source.promptId}`}
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
          ),
        )}
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

      {actionExample && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
          <p>
            質問の代わりに「
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {actionExample.repositoryLabel}のPR #12を「{actionExample.promptTitle}」でレビューして
            </span>
            」のように送ると、AIレビュー実行の確認画面が表示されます(リポジトリ名・PR番号・プロンプト名を含めてください)。
          </p>
          <button
            type="button"
            onClick={() =>
              setQuestion(
                `${actionExample.repositoryLabel}のPR #12を「${actionExample.promptTitle}」でレビューして`,
              )
            }
            className="shrink-0 rounded border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            この例文を入力欄にセット
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          required
          rows={2}
          placeholder={
            actionExample
              ? "質問を入力、またはAIレビューの実行を依頼(Enterで送信、Shift+Enterで改行)"
              : "質問を入力(Enterで送信、Shift+Enterで改行)"
          }
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

      {pendingAction?.kind === "action" && (
        <ConfirmDialog
          open
          title="レビューを実行しますか?"
          message={`${pendingAction.proposal.repositoryLabel} の PR #${pendingAction.proposal.pullRequestNumber} を、プロンプト「${pendingAction.proposal.promptLabel}」でレビューします。`}
          pending={actionPending}
          error={actionError}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
        />
      )}
    </div>
  );
}
