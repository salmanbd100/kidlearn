import { z } from "zod";

/**
 * The concept-token vocabulary stored in `Lesson.conceptsIntroduced` (file 30).
 *
 * A token is a prefix and a value — `letter:A`, `word:apple`, `number:7` — and the
 * prefix set lives here rather than in either app because all three sides of it
 * disagree otherwise: the admin lesson editor (file 32) writes the tokens, the
 * weekly-report aggregator buckets them, and the parent screen renders one chip
 * row per kind. A fourth kind added to a union in `apps/web` that the server does
 * not know about is a silently empty chip row.
 *
 * Not in `api/`: no endpoint sends or receives a prefix. It is stored vocabulary,
 * which is what the non-`api/` files in this package are for.
 */
export const CONCEPT_PREFIXES = ["letter", "word", "number"] as const;

export const ConceptPrefixSchema = z.enum(CONCEPT_PREFIXES);
export type ConceptPrefix = z.infer<typeof ConceptPrefixSchema>;

/**
 * Whether `value` is a prefix the aggregator understands.
 *
 * A `Set` rather than `Array.includes` on the `as const` tuple: `includes` on a
 * literal tuple type rejects an arbitrary `string` argument, and widening it back
 * with an `as` cast would be a type assertion away from an external boundary
 * (`general.md §2`).
 */
const PREFIXES = new Set<string>(CONCEPT_PREFIXES);

export function isConceptPrefix(value: string): value is ConceptPrefix {
  return PREFIXES.has(value);
}
