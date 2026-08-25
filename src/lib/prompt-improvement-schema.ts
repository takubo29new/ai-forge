import { z } from "zod";

export const PromptImprovementSuggestionSchema = z.object({
  pattern: z.string(),
  suggestion: z.string(),
  occurrenceCount: z.number().int(),
});

export const PromptImprovementOutputSchema = z.object({
  summary: z.string(),
  suggestions: z.array(PromptImprovementSuggestionSchema),
});

export type PromptImprovementSuggestion = z.infer<
  typeof PromptImprovementSuggestionSchema
>;
