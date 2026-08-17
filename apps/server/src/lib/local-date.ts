/**
 * Which calendar day an instant falls on, in a named timezone.
 *
 * Anything the product counts "per day" — the once-a-day coin grant (file 23),
 * the streak roll-over (file 27) — has to agree on where midnight is, and the
 * server's own clock is UTC. In `Asia/Dhaka` that is six hours behind: a lesson
 * finished at 3am local time is still the previous UTC day, so a child playing
 * before dawn would earn a second "first activity of the day".
 *
 * `Intl` rather than a date library: the conversion is a formatting question,
 * the ICU data ships with Node, and the alternative is a dependency for one
 * function. `formatToParts` rather than a locale that happens to print ISO order
 * — `en-CA` does today, and a locale's format is not a contract.
 */

/** `yyyy-MM-dd` for `instant` as seen in `timeZone`. */
export function localDateIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}
