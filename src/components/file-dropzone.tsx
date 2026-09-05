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

// バッチAI評価(Issue #108)向けの複数ファイル選択版。FileDropzoneと同じ
// 見た目のドロップゾーンだが、単一ファイルの状態遷移(プレビュー・クリア)を
// 複数ファイルの配列操作に置き換えた別コンポーネントにしている(FileDropzone
// 側にunion型でmultipleを生やすと、React Compilerがfileの由来を追えず
// useMemoの手動メモ化を保持できないため、既存の単一選択の型契約はそのまま残す)。
export function MultiFileDropzone({
  accept,
  files,
  onFilesChange,
}: {
  accept: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    // <input accept>はクリックで開くファイル選択ダイアログには効くが、
    // ドラッグ&ドロップ経路ではMIMEチェックが効かないため、ここで明示的に
    // 絞り込む(絞らないと型違いのファイルが混ざり、送信後にサーバー400→
    // skipカウントという遠回りな失敗になる)。
    const allowedTypes = accept.split(",").map((s) => s.trim());
    // 同じファイルを追加選択したときに重複しないよう、既存分は名前+サイズ+
    // 更新日時で除外する(名前とサイズだけだと、たまたま同名・同サイズの
    // 別ファイルまで誤って弾いてしまうため)。
    const existingKeys = new Set(files.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    const added = Array.from(fileList)
      .filter((f) => allowedTypes.includes(f.type))
      .filter(
        (f) => !existingKeys.has(`${f.name}:${f.size}:${f.lastModified}`),
      );
    onFilesChange([...files, ...added]);
  }

  function handleRemoveAt(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    onFilesChange(files.filter((_, i) => i !== index));
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
      className={`flex cursor-pointer flex-col gap-2 rounded border border-dashed px-3 py-3 text-sm transition-colors ${
        dragOver
          ? "border-accent bg-accent/5"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          handleFiles(e.target.files);
          // 同じファイルを続けて追加選択できるよう、選択のたびにvalueをリセットする。
          if (inputRef.current) inputRef.current.value = "";
        }}
        className="hidden"
      />
      {files.length === 0 ? (
        <div className="flex items-center gap-3">
          <FileIcon className="h-8 w-8 shrink-0 text-zinc-400" />
          <p className="text-zinc-500 dark:text-zinc-400">
            クリックまたはドラッグ&ドロップで複数ファイルを選択
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}:${f.size}:${i}`}
              className="flex items-center gap-2 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800"
            >
              <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {(f.size / 1024).toFixed(0)}KB
              </span>
              <button
                type="button"
                onClick={(e) => handleRemoveAt(i, e)}
                aria-label={`${f.name}の選択を解除`}
                className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
