import { prisma } from "@/lib/prisma";

// バックグラウンド処理(現状はAI評価のみ)の完了を通知センターに残すためのヘルパー。
// 呼び出し元(POST /api/evaluations)は本処理と切り離したベストエフォートとして
// 呼び出し、失敗してもEvaluation自体のステータス更新には影響させない。
export async function createEvaluationNotification({
  userId,
  evaluationId,
  title,
  status,
}: {
  userId: string;
  evaluationId: string;
  title: string;
  status: "SUCCESS" | "FAILED";
}) {
  await prisma.notification.create({
    data: {
      userId,
      message:
        status === "SUCCESS"
          ? `評価「${title}」が完了しました`
          : `評価「${title}」の実行に失敗しました`,
      link: `/evaluations/${evaluationId}`,
    },
  });
}
