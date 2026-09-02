import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@/components/icons";

// Evaluation.status(PENDING/SUCCESS/FAILEDの3値)とReview.status(PENDING/
// PROCESSING/SUCCESS/FAILEDの4値、Issue #129でGitHub Actionsワーカーが
// claimしたことを表すPROCESSINGを追加)で共通して使うラベル・アイコン・配色。
// EvaluationはPROCESSINGを持たないが、狭い方の型で広い方のRecordを引くのは
// 型上問題ないため共有している。
export type FlowStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

export const STATUS_LABEL: Record<FlowStatus, string> = {
  PENDING: "処理待ち",
  PROCESSING: "処理中",
  SUCCESS: "成功",
  FAILED: "失敗",
};

export const STATUS_ICON: Record<FlowStatus, typeof ClockIcon> = {
  PENDING: ClockIcon,
  PROCESSING: ClockIcon,
  SUCCESS: CheckCircleIcon,
  FAILED: XCircleIcon,
};

export const STATUS_TEXT: Record<FlowStatus, string> = {
  PENDING: "text-zinc-500",
  PROCESSING: "text-zinc-500",
  SUCCESS: "text-emerald-600 dark:text-emerald-400",
  FAILED: "text-red-600 dark:text-red-400",
};
