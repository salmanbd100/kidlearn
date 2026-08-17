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

/**
 * The calendar day before `localDate`, as `yyyy-MM-dd`.
 *
 * Arithmetic on the date string rather than on an instant, so it has no timezone
 * of its own to be wrong about. Subtracting 24 hours from a `Date` would give
 * the wrong answer on a spring-forward day in any zone that observes DST —
 * `Asia/Dhaka` does not, but "the streak breaks once a year in March" is not a
 * bug anyone would find quickly.
 */
export function previousLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

/**
 * A `yyyy-MM-dd` local date as the instant Postgres stores in a `@db.Date`
 * column: midnight UTC on that day.
 *
 * The column holds no time and no zone, and Prisma round-trips it as a `Date` at
 * UTC midnight — so this and `localDateIn("UTC", …)` are the two halves of one
 * conversion and must stay paired.
 */
export function localDateToUtcMidnight(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

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
