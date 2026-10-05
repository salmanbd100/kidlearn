import { LOCALES, type Locale } from "@kidlearn/types";

/**
 * Locale plumbing with no dependency on i18next, so a Server Component can read
 * the visitor's choice without pulling the i18n runtime into the server bundle.
 */

export const LOCALE_COOKIE_NAME = "kidlearn_locale";

export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const SUPPORTED_LOCALES = LOCALES;

export type { Locale };

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Falls back to English rather than throwing — a bad cookie must not 500. */
export function toLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The device's language — `undefined` on the server or before any choice. */
export function readLocaleCookie(): Locale | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];
  return isLocale(value) ? value : undefined;
}

/**
 * Written only by an explicit language choice. The cookie is what the server
 * renders the next visit in, so a child's language — applied for the length of a
 * session — must never reach it.
 */
export function writeLocaleCookie(locale: Locale): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in Safari before 18.4, and this cookie must be readable by the server on the next request.
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}
