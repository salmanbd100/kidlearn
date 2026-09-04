import type { LocalizedLabel } from "@kidlearn/types";
import { DEFAULT_LOCALE, isLocale } from "./locale";

/** The string to show from a both-locales label the dashboard received. */
export function pickLabel(label: LocalizedLabel, language: string): string {
  const locale = isLocale(language) ? language : DEFAULT_LOCALE;
  return (locale === "bn" ? label.bn : label.en) ?? label.en;
}
