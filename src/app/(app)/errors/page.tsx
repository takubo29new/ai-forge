import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

const SOURCE_STYLE: Record<string, string> = {
  SERVER: "text-red-600 dark:text-red-400",
  CLIENT: "text-amber-600 dark:text-amber-400",
};

export default async function ErrorsPage() {
  const userId = await requireUserId();

  const logs = await prisma.errorLog.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-4 mb-1 text-xl font-semibold">エラーログ</h1>
      <p className="mb-6 text-sm text-zinc-500">
        アプリで発生した想定外のエラーの直近{logs.length}件
      </p>

      {logs.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          記録されたエラーはありません
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li
            key={log.id}
            className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
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
