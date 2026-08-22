import { DEFAULT_LOCALE, isLocale } from "./locale";

/**
 * "Aug 17 – 23" — the header on a weekly report card (FR-DASH-05).
 *
 * A pure function on a pair of ISO strings rather than something a component
 * assembles, because the interesting cases are all edges: a week that crosses a
 * month, one that crosses a year, and Bangla's own digits and month names. Each is
 * one assertion here and would be a render there.
 *
 * **`formatRange`, not two formatted dates joined by a dash.** It is the one thing
 * here that cannot be hand-rolled correctly: it knows which fields the two ends
 * share and elides them *in the order the locale puts them in*. A hand-rolled
 * version that printed the month on the far end only — which reads correctly in
 * British English — produces "17 – Aug 23" under `en`, whose ICU data is
 * month-first. The locale decides, not this file.
 *
 * **Read as UTC.** Both dates arrive as UTC midnight: the server sends a date
 * column, which `res.json()` serialises in full (see `WeeklyReportSchema`). A
 * browser west of Greenwich reading them in local time would render every week a
 * day early, so the formatter is pinned to `UTC` rather than handed the visitor's
 * zone. The week is a fact about the household's calendar, not about the device
 * looking at it.
 *
 * The year is requested only when the two ends disagree about it, so an ordinary
 * week is not padded with a year the parent already knows — and a week spanning
 * New Year is not silently reported as seven days in one of them.
 *
 * `locale` is whatever i18next holds, which may be a region tag or something
 * unsupported; anything that is not a locale this app ships falls back to the
 * default rather than throwing inside a render.
 */
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
