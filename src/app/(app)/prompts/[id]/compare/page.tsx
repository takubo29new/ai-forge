import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { STATUS_LABEL, STATUS_ICON, STATUS_TEXT } from "@/lib/execution-status";

export default async function ExecutionComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const { a, b } = await searchParams;
  if (!a || !b) {
    notFound();
  }

  // このプロンプトに属する実行のみを対象にする(URL改変で無関係な実行IDを
  // 渡された場合でも、他プロンプトの結果が混ざって表示されないようにするため)。
  const executions = await prisma.execution.findMany({
    where: { id: { in: [a, b] }, promptVersion: { promptId: id } },
    include: { promptVersion: { select: { versionNumber: true } } },
  });

  if (executions.length !== 2 || executions.some((e) => e.userId !== userId)) {
    notFound();
  }

  const left = executions.find((e) => e.id === a)!;
  const right = executions.find((e) => e.id === b)!;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Link
        href={`/prompts/${id}?tab=history`}
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 実行履歴へ戻る
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold">実行結果の比較</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[left, right].map((e) => {
          const StatusIcon = STATUS_ICON[e.status];
          return (
            <div
              key={e.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span className="text-sm font-medium text-foreground">
                  v{e.promptVersion.versionNumber}
                </span>
                <span>{e.createdAt.toLocaleString("ja-JP")}</span>
                <span className={`inline-flex items-center gap-1 ${STATUS_TEXT[e.status]}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {STATUS_LABEL[e.status]}
                </span>
                <span>{e.model}</span>
                {e.status === "SUCCESS" && (
                  <span>
                    tokens: {e.promptTokens}+{e.completionTokens} /{" "}
                    {e.durationMs}ms
                  </span>
                )}
              </div>
              {e.status === "SUCCESS" ? (
                <Markdown>{e.resultText ?? ""}</Markdown>
              ) : (
                <p className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {e.errorMessage}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
