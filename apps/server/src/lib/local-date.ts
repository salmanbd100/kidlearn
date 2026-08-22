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
  return addLocalDays(localDate, -1);
}

/**
 * `days` either side of a `yyyy-MM-dd`, as a `yyyy-MM-dd`.
 *
 * Same reasoning as `previousLocalDate`, generalised: the arithmetic is on the
 * date string read as UTC, so it has no zone of its own to be wrong about on a
 * DST boundary. Was a private copy inside `learningTimeService` until file 30
 * needed the same walk for a week's edges; two implementations of "the day
 * before" is two chances for a week to start on a Sunday.
 */
export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * The Monday of the week `localDate` falls in, as `yyyy-MM-dd`.
 *
 * Monday, because FR-DASH-02 says a week starts on one and the weekly report
 * (FR-DASH-05) has to agree with the dashboard's `week` window about which seven
 * days it is measuring.
 *
 * `getUTCDay()` on the date string read as UTC midnight: the string carries no
 * zone of its own, which is what makes this independent of the server's clock.
 * Sunday is day 0 and is the *end* of its week, so it walks back six days rather
 * than none — the `(weekday + 6) % 7` is that off-by-one and nothing else.
 */
export function mondayOfLocalWeek(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return addLocalDays(localDate, -((weekday + 6) % 7));
}

/** Days in a week — named because it appears as both a bound and an offset. */
export const DAYS_PER_WEEK = 7;

/**
 * The `[from, to)` instants a week beginning `monday` covers in `timeZone`.
 *
 * Both edges as *local* midnights, so the seven days measured are the seven days
 * the household lived through. Shared rather than written twice: the dashboard's
 * `week` window (file 27) and the weekly report (file 30) must not be able to
 * disagree about which seven days a week is, and `mondayOfLocalWeek` alone was not
 * enough to guarantee that — the offset either side of it has to be the same too.
 */
export function localWeekBounds(
  timeZone: string,
  monday: string,
): { from: Date; to: Date } {
  return {
    from: localDayStartUtc(timeZone, monday),
    to: localDayStartUtc(timeZone, addLocalDays(monday, DAYS_PER_WEEK)),
  };
}

/**
 * The Sunday of the week beginning `monday`, in the date-only encoding a
 * `@db.Date` column round-trips as.
 *
 * Inclusive, and deliberately not the `to` above: a screen renders "17–23 Aug", so
 * it needs the Sunday rather than the following Monday.
 */
export function localWeekEndInclusive(monday: string): Date {
  return localDateToUtcMidnight(addLocalDays(monday, DAYS_PER_WEEK - 1));
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
