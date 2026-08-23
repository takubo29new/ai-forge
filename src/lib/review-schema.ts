import { z } from "zod";

export const ReviewFindingSchema = z.object({
  filePath: z.string(),
  line: z.number().int().nullable(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  body: z.string(),
});

export const ReviewOutputSchema = z.object({
  findings: z.array(ReviewFindingSchema),
});

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
