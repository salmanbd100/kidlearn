import { type LocalizedLabel, pickLocale } from "@kidlearn/types";
import { DEFAULT_LOCALE, isLocale } from "./locale";

/**
 * The string to show from a both-locales label the dashboard received — the
 * same fallback the API applies, so a blank Bangla label shows the English one.
 */
export function pickLabel(label: LocalizedLabel, language: string): string {
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  return pickLocale(label, locale).value ?? label.en;
}
