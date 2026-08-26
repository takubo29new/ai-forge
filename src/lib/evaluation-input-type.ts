import { FileIcon, FileTextIcon, ImageIcon } from "@/components/icons";

export type EvaluationInputType = "IMAGE" | "TEXT" | "PDF";

export const INPUT_TYPE_LABEL: Record<EvaluationInputType, string> = {
  IMAGE: "画像",
  TEXT: "テキスト",
  PDF: "PDF",
};

export const INPUT_TYPE_ICON: Record<EvaluationInputType, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  TEXT: FileTextIcon,
  PDF: FileIcon,
};
