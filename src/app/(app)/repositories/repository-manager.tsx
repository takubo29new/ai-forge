"use client";

import { useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";

type Repository = {
  id: string;
  owner: string;
  name: string;
  reviewCount: number;
  connectedAt: string;
};

type AvailableRepo = {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
};

export function RepositoryManager({
  initialRepositories,
}: {
  initialRepositories: Repository[];
}) {
  const [repositories, setRepositories] = useState(initialRepositories);
  const [showModal, setShowModal] = useState(false);
  const [available, setAvailable] = useState<AvailableRepo[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<Repository | null>(
    null,
  );

  const connectMutation = useApiMutation();
  const disconnectMutation = useApiMutation();
  const { showToast } = useToast();

  async function openConnectModal() {
    setShowModal(true);
    setListError(null);
    setLoadingAvailable(true);
    try {
      const res = await fetch("/api/github/repos");
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error ?? "リポジトリの取得に失敗しました");
        return;
      }
      setAvailable(data);
    } finally {
      setLoadingAvailable(false);
    }
  }

  async function handleConnect(repo: AvailableRepo) {
    const data = await connectMutation.mutate<Repository>(
      "/api/repositories",
      { method: "POST", body: { owner: repo.owner, name: repo.name } },
      "接続に失敗しました",
    );
    if (!data) return;
    setRepositories((prev) => [data, ...prev]);
    setAvailable((prev) =>
      prev.filter((r) => r.githubRepoId !== repo.githubRepoId),
    );
    showToast(`「${repo.owner}/${repo.name}」を接続しました`);
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    const repo = disconnectTarget;

    const result = await disconnectMutation.mutate(
      `/api/repositories/${repo.id}`,
      { method: "DELETE" },
      "解除に失敗しました",
    );
    if (result === null) return;
    setRepositories((prev) => prev.filter((r) => r.id !== repo.id));
    setDisconnectTarget(null);
    showToast(`「${repo.owner}/${repo.name}」の接続を解除しました`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {repositories.length}件のリポジトリを接続中
        </p>
        <button
          onClick={openConnectModal}
          className="rounded-full bg-accent transition-opacity hover:opacity-90 px-4 py-1.5 text-sm font-medium text-white"
        >
          + リポジトリを接続
        </button>
      </div>

      {disconnectMutation.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {disconnectMutation.error}
        </p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {repositories.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            接続済みのリポジトリはまだありません
          </li>
        )}
        {repositories.map((repo) => (
          <li
            key={repo.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {repo.owner}/{repo.name}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {repo.reviewCount}件のレビュー
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/repositories/${repo.id}`}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
              >
                開く
              </Link>
              <button
                onClick={() => setDisconnectTarget(repo)}
                disabled={disconnectMutation.pending}
                className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                解除
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        labelledBy="connect-repository-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="connect-repository-title" className="font-semibold">
            GitHubリポジトリを接続
          </h2>
          <button
            onClick={() => setShowModal(false)}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:underline"
          >
            閉じる
          </button>
        </div>

        {(listError || connectMutation.error) && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">
            {listError ?? connectMutation.error}
          </p>
        )}

        {loadingAvailable && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
        )}

        {!loadingAvailable && available.length === 0 && !listError && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            接続できるリポジトリがありません
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {available.map((repo) => (
            <li
              key={repo.githubRepoId}
              className="flex items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <span className="text-sm">
                {repo.fullName}
                {repo.private && (
                  <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                    (private)
                  </span>
                )}
              </span>
              <button
                onClick={() => handleConnect(repo)}
                disabled={connectMutation.pending}
                className="rounded bg-accent transition-opacity hover:opacity-90 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                接続
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmDialog
        open={disconnectTarget !== null}
        title="リポジトリの接続を解除"
        message={
          disconnectTarget
            ? disconnectTarget.reviewCount > 0
              ? `「${disconnectTarget.owner}/${disconnectTarget.name}」の接続を解除します。この操作で${disconnectTarget.reviewCount}件のレビュー結果も削除されます。よろしいですか?`
              : `「${disconnectTarget.owner}/${disconnectTarget.name}」の接続を解除します。よろしいですか?`
            : ""
        }
        confirmLabel="解除"
        danger
        pending={disconnectMutation.pending}
        error={disconnectTarget ? disconnectMutation.error : null}
        onConfirm={handleDisconnect}
        onCancel={() => {
          setDisconnectTarget(null);
          disconnectMutation.setError(null);
        }}
      />
    </div>
  );
}
