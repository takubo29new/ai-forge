import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parsePageSize } from "@/lib/list-limits";
import { PageSizeSelect } from "@/components/page-size-select";

const SOURCE_STYLE: Record<string, string> = {
  SERVER: "text-red-600 dark:text-red-400",
  CLIENT: "text-amber-600 dark:text-amber-400",
};

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const userId = await requireUserId();
  const { limit: limitParam } = await searchParams;
  const limit = parsePageSize(limitParam);

  const logs = await prisma.errorLog.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <div className="mt-4 mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold">エラーログ</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            アプリで発生した想定外のエラーの直近{logs.length}件
          </p>
        </div>
        <PageSizeSelect current={limit} />
      </div>

      {logs.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
          記録されたエラーはありません
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li
            key={log.id}
            className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span className={`font-medium ${SOURCE_STYLE[log.source]}`}>
                [{log.source}]
              </span>
              <span>{log.createdAt.toLocaleString("ja-JP")}</span>
              {log.path && <span>{log.method ? `${log.method} ` : ""}{log.path}</span>}
              {log.digest && <span>digest: {log.digest}</span>}
            </p>
            <p className="mt-1 text-sm">{log.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
