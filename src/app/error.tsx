"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">問題が発生しました</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        予期しないエラーが発生しました。時間をおいて再度お試しください。
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-foreground px-6 py-2 text-sm font-medium text-background"
      >
        再試行
      </button>
    </div>
  );
}
