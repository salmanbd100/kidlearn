import { z } from "zod";

/**
 * The concept-token vocabulary stored in `Lesson.conceptsIntroduced` (file 30).
 */
export const CONCEPT_PREFIXES = ["letter", "word", "number"] as const;

export const ConceptPrefixSchema = z.enum(CONCEPT_PREFIXES);
export type ConceptPrefix = z.infer<typeof ConceptPrefixSchema>;

/** Whether `value` is a prefix the aggregator understands. */
const PREFIXES = new Set<string>(CONCEPT_PREFIXES);

export function isConceptPrefix(value: string): value is ConceptPrefix {
  return PREFIXES.has(value);
}
