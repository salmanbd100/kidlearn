import { DEFAULT_LOCALE, isLocale } from "@kidlearn/i18n";

export function formatWeekRange(
  weekStartIso: string,
  weekEndIso: string,
  locale: string,
): string {
  const language = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const start = new Date(weekStartIso);
  const end = new Date(weekEndIso);

  const hasDifferentYears = start.getUTCFullYear() !== end.getUTCFullYear();

  return new Intl.DateTimeFormat(language, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(hasDifferentYears ? { year: "numeric" } : {}),
  }).formatRange(start, end);
}
