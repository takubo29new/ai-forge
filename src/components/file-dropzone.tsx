"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { FileIcon, CloseIcon } from "@/components/icons";

// 素の<input type="file">だけだとブラウザ標準の見た目のまま浮いてしまうため、
// 選択後のファイル名・画像サムネイル表示とドラッグ&ドロップに対応したUIに
// 差し替える(evaluation-manager.tsxの画像/PDFアップロードで使用、Issue #113)。
export function FileDropzone({
  accept,
  file,
  onChange,
  previewImage = false,
}: {
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  previewImage?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // createObjectURL自体はレンダー中の副作用として問題ない(DOM更新でもsetStateでもない)。
  // 解放だけはレンダー後に行う必要があるため、useEffectのクリーンアップに任せる。
  const previewUrl = useMemo(
    () => (previewImage && file ? URL.createObjectURL(file) : null),
    [file, previewImage],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFiles(files: FileList | null) {
    onChange(files?.[0] ?? null);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded border border-dashed px-3 py-3 text-sm transition-colors ${
        dragOver
          ? "border-accent bg-accent/5"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <FileIcon className="h-8 w-8 shrink-0 text-zinc-400" />
      )}
      <div className="min-w-0 flex-1">
        {file ? (
          <>
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {(file.size / 1024).toFixed(0)}KB
            </p>
          </>
        ) : (
          <p className="text-zinc-500 dark:text-zinc-400">
            クリックまたはドラッグ&ドロップでファイルを選択
          </p>
        )}
      </div>
      {file && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="選択を解除"
          className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
