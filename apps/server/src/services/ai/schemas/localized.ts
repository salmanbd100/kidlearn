import type { Locale } from "@kidlearn/types";
import { z } from "zod";

/**
 * An object with exactly the requested locales as required string keys.
 *
 * Extracted from `./lesson.ts` by file 35 when the story generator needed the
 * same binding. It is what makes an admin's language choice a contract rather
 * than a hint: asking for `["en"]` produces a schema where a response carrying
 * `bn` as well is rejected as strictly as one missing `en`, so the model cannot
 * quietly write a language nobody asked to review.
 *
 * `describe()` reaches the model — the description becomes part of the tool's
 * generated `input_schema` — so it is written as an instruction, not a note.
 *
 * ## Every locale in one response — the recorded decision (file 35, FR-I18N-01)
 *
 * Because this makes all requested locales required keys on the *same* string,
 * both languages are written in a single call and land as a single
 * `AIGenerationJob` — one review item, not two.
 *
 * The alternative is a call per locale. It would produce smaller outputs and let
 * each language retry on its own, but it buys those with divergence: two
 * independent generations of the same story reach different beats, and two
 * independent generations of the same quiz answer different questions with
 * different option sets. A reviewer would then be reconciling two drafts rather
 * than reading one, in a language they may not both speak.
 *
 * **One call, for MVP.** Revisit only if combined outputs start hitting
 * `max_tokens` — which `runGenerationJob` reports by name rather than retrying,
 * so it will be visible. The fallback then is not a call per locale but a
 * *sequence*: generate `en`, then translate with the `en` JSON as grounding, which
 * keeps the consistency this decision is protecting.
 */
export function localized(
  languages: readonly Locale[],
  description: string,
  max?: number,
) {
  const value =
    max === undefined ? z.string().min(1) : z.string().min(1).max(max);
  const shape = Object.fromEntries(
    languages.map((language) => [language, value]),
  );
  return z.object(shape).strict().describe(description);
}
