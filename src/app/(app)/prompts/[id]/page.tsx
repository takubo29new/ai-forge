import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { EditTab } from "./edit-tab";
import { ExecuteTab } from "./execute-tab";
import { ImprovementSuggestions } from "./improvement-suggestions";
import { ExecutionHistory } from "./execution-history";
import { LIST_LIMIT, parsePageSize } from "@/lib/list-limits";
import { PageSizeSelect } from "@/components/page-size-select";

const TABS = [
  { key: "edit", label: "編集" },
  { key: "execute", label: "実行" },
  { key: "versions", label: "バージョン履歴" },
  { key: "history", label: "実行履歴" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function PromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; limit?: string }>;
}) {
  const userId = await requireUserId();

  const { id } = await params;
  const { tab: tabParam, limit: limitParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "edit";
  const limit = parsePageSize(limitParam);

  const [prompt, categories] = await Promise.all([
    prisma.prompt.findUnique({
      where: { id },
      include: {
        category: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    }),
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!prompt || prompt.userId !== userId) {
    notFound();
  }

  const latestVersion = prompt.versions[0];

  // 「実行」タブのバージョン選択には表示件数の設定を影響させたくないため
  // (選べるバージョンが減ってしまうと紛らわしい)、常にLIST_LIMIT件まで取得する。
  // 「バージョン履歴」タブの一覧だけがユーザーの選んだ表示件数(limit)に従う。
  const versions =
    tab === "versions"
      ? await prisma.promptVersion.findMany({
          where: { promptId: id },
          orderBy: { versionNumber: "desc" },
          take: limit,
        })
      : tab === "execute"
        ? await prisma.promptVersion.findMany({
            where: { promptId: id },
            orderBy: { versionNumber: "desc" },
            take: LIST_LIMIT,
          })
        : null;

  const reviewCommentCount =
    tab === "edit"
      ? await prisma.reviewComment.count({
          where: { review: { status: "SUCCESS", promptVersion: { promptId: id } } },
        })
      : 0;

  const executions =
    tab === "history"
      ? await prisma.execution.findMany({
          where: { promptVersion: { promptId: id } },
          include: { promptVersion: { select: { versionNumber: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/prompts"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← 一覧へ戻る
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">{prompt.title}</h1>

      <nav className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/prompts/${id}?tab=${t.key}`}
            className={`px-3 py-2 text-sm ${
              tab === t.key
                ? "border-b-2 border-foreground font-medium"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "edit" && (
        <>
          <EditTab
            promptId={id}
            title={prompt.title}
            categoryId={prompt.categoryId}
            content={latestVersion?.content ?? ""}
            versionNumber={latestVersion?.versionNumber ?? 0}
            categories={categories}
          />
          <ImprovementSuggestions
            promptId={id}
            commentCount={reviewCommentCount}
          />
        </>
      )}

      {(tab === "versions" || tab === "history") && (
        <div className="mb-3 flex justify-end">
          <PageSizeSelect current={limit} />
        </div>
      )}

      {tab === "versions" && versions && (
        <ul className="flex flex-col gap-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              <details>
                <summary className="cursor-pointer px-4 py-3 text-sm">
                  <span className="font-medium">v{v.versionNumber}</span>{" "}
                  <span className="text-zinc-500">
                    {v.createdAt.toLocaleString("ja-JP")}
                  </span>{" "}
                  {v.note && (
                    <span className="text-zinc-500">— {v.note}</span>
                  )}
                </summary>
                <pre className="whitespace-pre-wrap border-t border-zinc-200 px-4 py-3 font-mono text-xs dark:border-zinc-800">
                  {v.content}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}

      {tab === "execute" && versions && (
        <ExecuteTab
          promptId={id}
          versions={versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            content: v.content,
          }))}
        />
      )}

      {tab === "history" && executions && (
        <ExecutionHistory
          promptId={id}
          executions={executions.map((e) => ({
            id: e.id,
            createdAt: e.createdAt.toISOString(),
            versionNumber: e.promptVersion.versionNumber,
            status: e.status,
            model: e.model,
            resultText: e.resultText,
            errorMessage: e.errorMessage,
            promptTokens: e.promptTokens,
            completionTokens: e.completionTokens,
            durationMs: e.durationMs,
          }))}
        />
      )}
    </div>
  );
}
