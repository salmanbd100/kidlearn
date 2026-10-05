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

/**
 * A blank string is a translation nobody has written yet, not one to serve: a
 * Bangla `introScript` saved as `""` would otherwise beat a real English one and
 * hand the child a silent, empty intro.
 */
function isSupplied<T>(value: T | null | undefined): value is T {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim() !== "";
}

/**
 * Resolves a per-locale map down to the single value the child should see,
 * falling back to English, and reports which locale actually supplied it
 * (FR-PROF-03: the client is told what it got, and never sees the other
 * language's copy).
 */
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

/**
 * Deviation from the implementation spec: it assumed localized content was
 * stored as per-locale JSON maps on the row itself. The settled schema uses
 * translation tables instead (`LessonTranslation` etc.), one row per language.
 * This adapter turns such an array into the map `pickLocale` expects, so the
 * helper's signature and intent survive the schema change.
 */
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
