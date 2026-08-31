import type { GradeLevelValue, Locale } from "@kidlearn/types";

/**
 * How a grade and a language are spelled in the CMS.
 *
 * One copy, because five drifting ones is how "KG-1" and "KG1" end up on two
 * screens of the same tool. The server made the same move in file 35
 * (`services/ai/prompts/labels.ts`); this is the browser half of it.
 *
 * English only, under the recorded `(admin)` exception in `frontend.md §3` — the
 * CMS is an internal tool. Child- and parent-facing labels go through `i18next`.
 *
 * Labels a single screen owns — a quiz format, an activity type — stay with that
 * screen. These two are here because a grade and a language are the vocabulary of
 * the whole CMS.
 */

export const GRADE_LABELS: Record<GradeLevelValue, string> = {
  NURSERY: "Nursery",
  KG1: "KG-1",
  KG2: "KG-2",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};
