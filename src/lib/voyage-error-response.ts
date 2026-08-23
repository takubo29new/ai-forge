import { NextResponse } from "next/server";
import { VoyageApiError } from "@/lib/voyage";
import { logError } from "@/lib/error-log";

// Voyage AI呼び出し失敗時の共通レスポンス生成。429(レート制限)は「もう一度
// お試しください」では解決しないことが多いため、支払い方法未登録アカウントの
// 制限(3RPM/10K TPM)に触れた具体的な案内を返す。あわせてErrorLogに記録し、
// 次回以降は/errorsページやDBから直接原因を追えるようにする。
export async function voyageErrorResponse(
  error: unknown,
  context: { path: string; userId: string },
) {
  const message =
    error instanceof VoyageApiError && error.status === 429
      ? "Voyage AIのレート制限に達しました。しばらく待ってから再度お試しいただくか、Voyage AIダッシュボード(https://dashboard.voyageai.com/)で支払い方法を登録すると上限が緩和されます(登録しても無料枠は引き続き適用されます)。"
      : "埋め込みの生成に失敗しました。もう一度お試しください。";

  await logError({
    source: "SERVER",
    message: `Voyage AI呼び出しに失敗しました: ${
      error instanceof Error ? error.message : String(error)
    }`,
    path: context.path,
    userId: context.userId,
  });

  return NextResponse.json({ error: message }, { status: 502 });
}
