import { FileIcon, FileTextIcon, ImageIcon, MusicIcon } from "@/components/icons";

export type EvaluationInputType = "IMAGE" | "TEXT" | "PDF" | "AUDIO";

export const INPUT_TYPE_LABEL: Record<EvaluationInputType, string> = {
  IMAGE: "画像",
  TEXT: "テキスト",
  PDF: "PDF",
  AUDIO: "音声",
};

export const INPUT_TYPE_ICON: Record<EvaluationInputType, typeof ImageIcon> = {
  IMAGE: ImageIcon,
  TEXT: FileTextIcon,
  PDF: FileIcon,
  AUDIO: MusicIcon,
};
