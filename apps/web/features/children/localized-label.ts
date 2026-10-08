import { DEFAULT_LOCALE, isLocale } from "@kidlearn/i18n";
import { type LocalizedLabel, pickLocale } from "@kidlearn/types";

/** Same fallback as the API: a blank Bangla label shows the English one. */
export function pickLabel(label: LocalizedLabel, language: string): string {
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  return pickLocale(label, locale).value ?? label.en;
}
