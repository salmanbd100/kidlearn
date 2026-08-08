import { LOCALES, type Locale } from "@kidlearn/types";

/**
 * Locale plumbing with no dependency on i18next, so a Server Component can read
 * the visitor's choice without pulling the i18n runtime into the server bundle.
 *
 * The cookie is the source of truth for a *device*. Once a child profile is
 * active, its `language` column wins and is pushed here (wired in file 15).
 */

export const LOCALE_COOKIE_NAME = "kidlearn_locale";

export const DEFAULT_LOCALE: Locale = "en";

/** One year, in the minutes unit i18next's cookie detector expects. */
export const LOCALE_COOKIE_MINUTES = 365 * 24 * 60;

export const SUPPORTED_LOCALES = LOCALES;

export type { Locale };

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Falls back to English rather than throwing — a bad cookie must not 500. */
export function toLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
