import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { parsePageSize } from "@/lib/list-limits";
import { EvaluationManager } from "./evaluation-manager";

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const userId = await requireUserId();
  const { limit: limitParam } = await searchParams;
  const limit = parsePageSize(limitParam);

  const [evaluations, promptRows] = await Promise.all([
    prisma.evaluation.findMany({
      where: { userId },
      include: { _count: { select: { findings: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.prompt.findMany({
      where: { userId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        ← ダッシュボードへ
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="mb-2 text-xl font-semibold">AI評価</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
画像・テキスト・PDF・音声とプロンプトを選ぶと、Claudeが観点別のコメント(良い点・提案・気になる点)で評価します。アップロードしたファイル自体は保存されず、評価結果のみ記録されます。
        </p>
      </div>
      <EvaluationManager
        initialEvaluations={evaluations.map((e) => ({
          id: e.id,
          title: e.title,
          status: e.status,
          inputType: e.inputType,
          findingCount: e._count.findings,
          createdAt: e.createdAt.toISOString(),
          batchId: e.batchId,
        }))}
        prompts={promptRows.map((p) => ({
          id: p.id,
          title: p.title,
          content: p.versions[0]?.content ?? "",
        }))}
        currentLimit={limit}
      />
    </div>
  );
}
