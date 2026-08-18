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

/**
 * The instant `localDate` begins in `timeZone` — i.e. local midnight, as UTC.
 *
 * The inverse of `localDateIn`, and the other half of every "per period" query in
 * this codebase: learning time (file 27) selects `SessionEvent` rows between two
 * of these, and the rows are stored UTC.
 *
 * `Intl` again rather than `date-fns-tz`, for the reason at the top of this file
 * and one more: inverting a zone offset is the only thing a library would be doing
 * here, and it is eight lines with the ICU data Node already ships.
 */
export function localDayStartUtc(timeZone: string, localDate: string): Date {
  const wallClockAsUtc = new Date(`${localDate}T00:00:00.000Z`).getTime();

  // Reading the wall clock as UTC overshoots by exactly the zone's offset, so the
  // first guess is that instant minus the offset *there*. Re-resolving at the
  // guess is what handles a DST transition falling between the two: an offset is
  // constant either side of a transition, so one correction converges.
  const guess = wallClockAsUtc - zoneOffsetMs(timeZone, wallClockAsUtc);
  return new Date(wallClockAsUtc - zoneOffsetMs(timeZone, guess));
}

/**
 * How far ahead of UTC `timeZone` is at `instant`, in milliseconds. Positive east
 * of Greenwich.
 *
 * Derived by formatting the instant into that zone's wall clock and reading the
 * result back as though it were UTC; the difference is the offset. Second
 * resolution, which is all any real zone has ever needed.
 */
function zoneOffsetMs(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // `hour12: false` renders midnight as hour 24 on some ICU builds; `h23` is
    // the cycle that does not.
    hourCycle: "h23",
  }).formatToParts(new Date(instant));

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const wallClockAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );

  return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}
