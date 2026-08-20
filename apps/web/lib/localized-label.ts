import type { LocalizedLabel } from "@kidlearn/types";
import { DEFAULT_LOCALE, isLocale } from "./locale";

/**
 * The string to show from a both-locales label the dashboard received.
 *
 * The dashboard is the one surface the server does not resolve text for: the
 * reader is the parent, and their language is an i18next choice the API never
 * sees (see `LocalizedLabelSchema` in `@kidlearn/types`). So the pick happens
 * here, from `i18n.language`.
 *
 * A missing Bangla translation falls back to English rather than rendering an
 * empty title — `en` is the only string the contract guarantees. `language` is
 * whatever i18next holds, which may be a region tag or something unsupported, so
 * anything that is not a known locale is treated as the default.
 */
export function pickLabel(label: LocalizedLabel, language: string): string {
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  return (locale === "bn" ? label.bn : label.en) ?? label.en;
}
