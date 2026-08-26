import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@/components/icons";

// Evaluation.status / Review.status(いずれもPENDING/SUCCESS/FAILEDの3値)で
// 共通して使うラベル・アイコン・配色。Reviewは実行が同期的なため実際にはPENDING
// のまま表示されることはないが、型としては同じ3値を持つため共有している。
export type FlowStatus = "PENDING" | "SUCCESS" | "FAILED";

export const STATUS_LABEL: Record<FlowStatus, string> = {
  PENDING: "処理中",
  SUCCESS: "成功",
  FAILED: "失敗",
};

export const STATUS_ICON: Record<FlowStatus, typeof ClockIcon> = {
  PENDING: ClockIcon,
  SUCCESS: CheckCircleIcon,
  FAILED: XCircleIcon,
};

export const STATUS_TEXT: Record<FlowStatus, string> = {
  PENDING: "text-zinc-500",
  SUCCESS: "text-emerald-600 dark:text-emerald-400",
  FAILED: "text-red-600 dark:text-red-400",
};
