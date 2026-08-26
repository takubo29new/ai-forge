"use client";

import { useState } from "react";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";

type ShareKind = "reviews" | "evaluations";

// レビュー・AI評価の結果画面に共通で貼り付ける、読み取り専用の公開共有リンクの
// 作成・コピー・解除UI。ログイン不要で誰でも閲覧できるようになるため、作成前に
// ConfirmDialogで非公開情報が含まれていないかの確認を挟む(解除は非破壊的な
// ため確認なしで実行する)。
export function ShareControl({
  kind,
  id,
  initialShareToken,
}: {
  kind: ShareKind;
  id: string;
  initialShareToken: string | null;
}) {
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate, pending, error, setError } = useApiMutation();
  const { showToast } = useToast();

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/share/${kind}/${shareToken}`
      : null;

  async function handleCreate() {
    const result = await mutate<{ shareToken: string }>(
      `/api/${kind}/${id}/share`,
      { method: "POST" },
      "共有リンクの作成に失敗しました",
    );
    if (result) {
      setShareToken(result.shareToken);
      setConfirmOpen(false);
      showToast("共有リンクを作成しました");
    }
  }

  async function handleRevoke() {
    const result = await mutate(
      `/api/${kind}/${id}/share`,
      { method: "DELETE" },
      "共有の解除に失敗しました",
    );
    if (result === null) return;
    setShareToken(null);
    showToast("共有を解除しました");
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("リンクをコピーしました");
    } catch {
      setError("クリップボードへのコピーに失敗しました");
    }
  }

  if (!shareToken) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          共有リンクを作成
        </button>
        <ConfirmDialog
          open={confirmOpen}
          title="共有リンクを作成しますか?"
          message="リンクを知っている人は誰でも(ログイン不要で)この結果を閲覧できるようになります。プライベートリポジトリの内容や個人的な入力内容など、非公開の情報が含まれていないか確認してください。"
          confirmLabel="作成する"
          pending={pending}
          error={error}
          onConfirm={handleCreate}
          onCancel={() => {
            setConfirmOpen(false);
            setError(null);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-accent/10 px-2 py-1 text-accent">共有中</span>
      <code className="max-w-[16rem] truncate rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-900">
        {shareUrl}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        コピー
      </button>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={pending}
        className="rounded border border-red-300 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {pending ? "解除中..." : "共有を解除"}
      </button>
      {error && (
        <span className="text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
