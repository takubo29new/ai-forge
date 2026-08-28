import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PROMPT_EXPORT_FORMAT } from "@/app/api/prompts/export/route";
import { LIST_LIMIT } from "@/lib/list-limits";

type ImportEntry = { title: string; categoryName: string | null; content: string };

// /api/prompts/exportが出力したJSONを取り込む(Issue #107)。同名プロンプトが
// 既に存在する場合は上書き・スキップではなく「新バージョンとして追加」する
// (既存の編集フロー`PATCH /api/prompts/:id`と同じ、履歴を失わない挙動。
// ユーザーとの相談で決定)。個々のエントリが不正な場合はスキップして続行し、
// ファイル全体が想定外の形式の場合のみ400で弾く。
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { prompts?: unknown }).prompts)
  ) {
    return NextResponse.json(
      { error: "不正なファイル形式です(prompts配列が見つかりません)" },
      { status: 400 },
    );
  }
  if (
    "format" in body &&
    typeof (body as { format?: unknown }).format === "string" &&
    (body as { format: string }).format !== PROMPT_EXPORT_FORMAT
  ) {
    return NextResponse.json(
      { error: "ai-forgeのプロンプトエクスポート形式ではありません" },
      { status: 400 },
    );
  }

  const rawEntries = (body as { prompts: unknown[] }).prompts;
  if (rawEntries.length > LIST_LIMIT) {
    return NextResponse.json(
      { error: `一度にインポートできるのは${LIST_LIMIT}件までです(${rawEntries.length}件)` },
      { status: 400 },
    );
  }

  const entries: ImportEntry[] = [];
  let skipped = 0;
  for (const raw of rawEntries) {
    if (typeof raw !== "object" || raw === null) {
      skipped++;
      continue;
    }
    const title = typeof (raw as { title?: unknown }).title === "string"
      ? (raw as { title: string }).title.trim()
      : "";
    const content = typeof (raw as { content?: unknown }).content === "string"
      ? (raw as { content: string }).content
      : "";
    const categoryNameRaw = (raw as { categoryName?: unknown }).categoryName;
    const categoryName =
      typeof categoryNameRaw === "string" && categoryNameRaw.trim()
        ? categoryNameRaw.trim()
        : null;

    if (!title || !content.trim()) {
      skipped++;
      continue;
    }
    entries.push({ title, categoryName, content });
  }

  // rawEntries自体が空(0件のエクスポートを取り込んだだけ)なら不正ではないため、
  // 「中身はあったのに1件も有効な項目が無かった」場合だけエラーにする。
  if (rawEntries.length > 0 && entries.length === 0) {
    return NextResponse.json(
      { error: "有効なプロンプトが見つかりませんでした。ai-forgeのエクスポート形式か確認してください" },
      { status: 400 },
    );
  }

  let createdCount = 0;
  let versionsAddedCount = 0;

  await prisma.$transaction(async (tx) => {
    // カテゴリ名→idのキャッシュ(同じカテゴリ名が複数プロンプトで再利用されるため)。
    const categoryIdByName = new Map<string, string>();

    for (const entry of entries) {
      let categoryId: string | null = null;
      if (entry.categoryName) {
        const cached = categoryIdByName.get(entry.categoryName);
        if (cached) {
          categoryId = cached;
        } else {
          const category = await tx.category.upsert({
            where: { userId_name: { userId, name: entry.categoryName } },
            create: { userId, name: entry.categoryName },
            update: {},
          });
          categoryIdByName.set(entry.categoryName, category.id);
          categoryId = category.id;
        }
      }

      const existing = await tx.prompt.findFirst({
        where: { userId, title: entry.title },
      });

      if (existing) {
        const latest = await tx.promptVersion.findFirst({
          where: { promptId: existing.id },
          orderBy: { versionNumber: "desc" },
        });
        await tx.promptVersion.create({
          data: {
            promptId: existing.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            content: entry.content,
            note: "インポートで追加",
          },
        });
        versionsAddedCount++;
      } else {
        await tx.prompt.create({
          data: {
            title: entry.title,
            userId,
            categoryId,
            versions: { create: { versionNumber: 1, content: entry.content } },
          },
        });
        createdCount++;
      }
    }
  });

  return NextResponse.json({
    created: createdCount,
    versionsAdded: versionsAddedCount,
    skipped,
  });
}
