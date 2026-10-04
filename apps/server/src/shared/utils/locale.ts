import type { Language } from "@kidlearn/db";

/** The two locales kidlearn ships (FR-I18N-01). Mirrors the Prisma `Language` enum. */
export type Lang = Language;

/**
 * Every child-facing string is guaranteed to exist in English; Bangla is
 * best-effort. So `en` is the one safe fallback — never the other direction.
 */
export const FALLBACK_LANG = "en" as const satisfies Lang;

export type LocalePick<T> = { value: T | null; locale: Lang };

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
  map: Partial<Record<Lang, T | null>> | null | undefined,
  lang: Lang,
): LocalePick<T> {
  const preferred = map?.[lang];
  if (isSupplied(preferred)) {
    return { value: preferred, locale: lang };
  }
  const fallback = map?.[FALLBACK_LANG];
  if (isSupplied(fallback)) {
    return { value: fallback, locale: FALLBACK_LANG };
  }
  return { value: null, locale: FALLBACK_LANG };
}

/**
 * Deviation from the implementation spec: it assumed localized content was
 * stored as per-locale JSON maps on the row itself. The settled schema uses
 * translation tables instead (`LessonTranslation` etc.), one row per language.
 * This adapter turns such an array into the map `pickLocale` expects, so the
 * helper's signature and intent survive the schema change.
 */
export function toLocaleMap<TRow extends { language: Lang }, TValue>(
  rows: readonly TRow[] | null | undefined,
  select: (row: TRow) => TValue | null | undefined,
): Partial<Record<Lang, TValue | null>> {
  const map: Partial<Record<Lang, TValue | null>> = {};
  for (const row of rows ?? []) {
    map[row.language] = select(row) ?? null;
  }
  return map;
}
