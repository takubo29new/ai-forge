"use client";

import { Modal } from "./modal";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "実行",
  cancelLabel = "キャンセル",
  danger,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-dialog-title">
      <h2 id="confirm-dialog-title" className="mb-2 font-semibold">
        {title}
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {message}
      </p>
      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-zinc-300 px-4 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${
            danger
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-accent transition-opacity hover:opacity-90 text-white"
          }`}
        >
          {pending ? "処理中..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
