// Which calendar day an instant falls on, in a named timezone.

/** The calendar day before `localDate`, as `yyyy-MM-dd`. */
export function previousLocalDate(localDate: string): string {
  return addLocalDays(localDate, -1);
}

/** `days` either side of a `yyyy-MM-dd`, as a `yyyy-MM-dd`. */
export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** The Monday of the week `localDate` falls in, as `yyyy-MM-dd`. */
export function mondayOfLocalWeek(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return addLocalDays(localDate, -((weekday + 6) % 7));
}

/** Days in a week — named because it appears as both a bound and an offset. */
export const DAYS_PER_WEEK = 7;

/** The `[from, to)` instants a week beginning `monday` covers in `timeZone`. */
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
 */
export function localWeekEndInclusive(monday: string): Date {
  return localDateToUtcMidnight(addLocalDays(monday, DAYS_PER_WEEK - 1));
}

/**
 * A `yyyy-MM-dd` local date as the instant Postgres stores in a `@db.Date`
 * column: midnight UTC on that day.
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
