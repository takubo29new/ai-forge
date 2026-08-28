import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// バックアップ・他環境への移行・チーム内共有向けのエクスポート(Issue #107)。
// スコープを絞り、バージョン履歴全体ではなく最新バージョンの内容のみを対象とする
// (再インポート時は/api/prompts/importが「同名プロンプトへの新バージョン追加」として
// 扱うため、最新状態の受け渡しという用途には十分)。
export const PROMPT_EXPORT_FORMAT = "ai-forge-prompts";
export const PROMPT_EXPORT_VERSION = 1;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const prompts = await prisma.prompt.findMany({
    where: { userId: session.user.id },
    include: {
      category: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
    orderBy: { title: "asc" },
  });

  const payload = {
    format: PROMPT_EXPORT_FORMAT,
    version: PROMPT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    prompts: prompts.map((p) => ({
      title: p.title,
      categoryName: p.category?.name ?? null,
      content: p.versions[0]?.content ?? "",
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ai-forge-prompts-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
