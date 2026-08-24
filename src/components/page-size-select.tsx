"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "@/lib/list-limits";

// URLのクエリパラメータ(デフォルト"limit")を書き換えて一覧の表示件数を
// 切り替える。他のクエリパラメータ(tab等)は保持する。
export function PageSizeSelect({
  current,
  paramName = "limit",
}: {
  current: number;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
      表示件数
      <select
        value={current}
        onChange={handleChange}
        className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        {PAGE_SIZE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}件
          </option>
        ))}
      </select>
    </label>
  );
}
