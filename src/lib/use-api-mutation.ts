"use client";

import { useState } from "react";

type MutationOptions = {
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

// 各画面のクライアントコンポーネントで繰り返されていた
// 「pending管理 → fetch → !res.ok ならエラー表示」の定型処理をまとめたフック。
// GET(一覧取得などの問い合わせ)は対象外とし、状態を変更するAPI呼び出し
// (POST/PATCH/DELETE)専用にしている。
export function useApiMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate<T = unknown>(
    url: string,
    options: MutationOptions,
    fallbackErrorMessage = "処理に失敗しました",
  ): Promise<T | null> {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(url, {
        method: options.method,
        headers:
          options.body !== undefined
            ? { "Content-Type": "application/json" }
            : undefined,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      if (res.status === 204) {
        return {} as T;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : fallbackErrorMessage,
        );
        return null;
      }
      return data as T;
    } catch {
      setError(fallbackErrorMessage);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { mutate, pending, error, setError };
}
