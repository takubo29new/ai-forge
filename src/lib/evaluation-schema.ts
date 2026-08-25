import { z } from "zod";

export const EvaluationFindingSchema = z.object({
  label: z.string(),
  tone: z.enum(["POSITIVE", "SUGGESTION", "CONCERN"]),
  score: z.number().int().min(0).max(100).nullable(),
  body: z.string(),
});

export const EvaluationOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(EvaluationFindingSchema),
});

export type EvaluationFinding = z.infer<typeof EvaluationFindingSchema>;
