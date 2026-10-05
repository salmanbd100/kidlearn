import { isLocale } from "@kidlearn/i18n";
import { LOCALES, type Locale } from "@kidlearn/types";

export const LOCALE_COOKIE_NAME = "kidlearn_locale";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const SUPPORTED_LOCALES = LOCALES;

export type { Locale };

export function readLocaleCookie(): Locale | undefined {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];
  return isLocale(value) ? value : undefined;
}

/** Only for an explicit language choice: the cookie sets the server's next render, so a session-scoped language must never reach it. */
export function writeLocaleCookie(locale: Locale): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in Safari before 18.4, and this cookie must be readable by the server on the next request.
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}
