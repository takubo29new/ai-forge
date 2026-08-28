"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useApiMutation } from "@/lib/use-api-mutation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";

type ImportResult = { created: number; versionsAdded: number; skipped: number };

// /api/prompts/exportが出力したJSONファイルを選んでインポートする(Issue #107)。
// 同名プロンプトへは新バージョンとして追加されるため、誤って選んでも
// 既存データを上書き・削除することはない。
export function PromptImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { mutate, pending, error } = useApiMutation();
  const { showToast } = useToast();

  async function handleFile(file: File) {
    const text = await file.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      showToast("JSONファイルとして読み込めませんでした");
      return;
    }

    const result = await mutate<ImportResult>(
      "/api/prompts/import",
      { method: "POST", body },
      "インポートに失敗しました",
    );
    if (!result) return;

    const parts = [
      result.created > 0 && `新規${result.created}件`,
      result.versionsAdded > 0 && `既存プロンプトへ新バージョン${result.versionsAdded}件`,
      result.skipped > 0 && `不正な項目${result.skipped}件をスキップ`,
    ].filter(Boolean);
    showToast(
      parts.length > 0 ? `インポートしました(${parts.join("・")})` : "インポート対象がありませんでした",
    );
    router.refresh();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline disabled:opacity-50"
      >
        {pending && <Spinner className="h-3.5 w-3.5" />}
        インポート
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </>
  );
}
