import type { Locale } from "../primitives.js";

// Locale fallback for child-facing content (FR-I18N-01, FR-PROF-03), shared so
// the API and the web app resolve a missing Bangla string the same way and
// both can say which locale they ended up with.
/**
 * Every child-facing string is guaranteed to exist in English; Bangla is
 * best-effort. So `en` is the one safe fallback — never the other direction.
 */
export const FALLBACK_LOCALE = "en" as const satisfies Locale;

export type LocalePick<T> = { value: T | null; locale: Locale };

/** A blank string is an unwritten translation: a Bangla `introScript` saved as `""` must not beat a real English one. */
function isSupplied<T>(value: T | null | undefined): value is T {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim() !== "";
}

/** Picks the value the child should see, falling back to English, and reports which locale supplied it (FR-PROF-03). */
export function pickLocale<T>(
  map: Partial<Record<Locale, T | null>> | null | undefined,
  lang: Locale,
): LocalePick<T> {
  const preferred = map?.[lang];
  if (isSupplied(preferred)) {
    return { value: preferred, locale: lang };
  }
  const fallback = map?.[FALLBACK_LOCALE];
  if (isSupplied(fallback)) {
    return { value: fallback, locale: FALLBACK_LOCALE };
  }
  return { value: null, locale: FALLBACK_LOCALE };
}

/** Turns a translation-table row array (`LessonTranslation` etc.) into the map `pickLocale` expects. */
export function toLocaleMap<TRow extends { language: Locale }, TValue>(
  rows: readonly TRow[] | null | undefined,
  select: (row: TRow) => TValue | null | undefined,
): Partial<Record<Locale, TValue | null>> {
  const map: Partial<Record<Locale, TValue | null>> = {};
  for (const row of rows ?? []) {
    map[row.language] = select(row) ?? null;
  }
  return map;
}
