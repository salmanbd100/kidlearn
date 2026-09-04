import { DEFAULT_LOCALE, isLocale } from "./locale";

/** "3 minutes ago", "yesterday", "12 days ago" — the activity feed's dates. */
export function formatRelative(date: Date, locale: string, now: Date): string {
  const language = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });

  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < MINUTE_MS) return relative.format(0, "second");
  if (absMs < HOUR_MS) {
    return relative.format(Math.trunc(diffMs / MINUTE_MS), "minute");
  }
  if (absMs < DAY_MS) {
    return relative.format(Math.trunc(diffMs / HOUR_MS), "hour");
  }

  return relative.format(calendarDaysBetween(now, date), "day");
}

/** The full date, for the `title` a relative date hangs off. */
export function formatAbsolute(date: Date, locale: string): string {
  const language = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Whole days between two local midnights — never a count of 24-hour blocks. */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((localMidnight(to) - localMidnight(from)) / DAY_MS);
}

function localMidnight(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}
