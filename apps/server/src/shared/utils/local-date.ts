export function previousLocalDate(localDate: string): string {
  return addLocalDays(localDate, -1);
}

export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function mondayOfLocalWeek(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return addLocalDays(localDate, -((weekday + 6) % 7));
}

export const DAYS_PER_WEEK = 7;

export function localWeekBounds(
  timeZone: string,
  monday: string,
): { from: Date; to: Date } {
  return {
    from: localDayStartUtc(timeZone, monday),
    to: localDayStartUtc(timeZone, addLocalDays(monday, DAYS_PER_WEEK)),
  };
}

export function localWeekEndInclusive(monday: string): Date {
  return localDateToUtcMidnight(addLocalDays(monday, DAYS_PER_WEEK - 1));
}

export function localDateToUtcMidnight(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

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

export function localDayStartUtc(timeZone: string, localDate: string): Date {
  const wallClockAsUtc = new Date(`${localDate}T00:00:00.000Z`).getTime();

  // Reading the wall clock as UTC overshoots by the zone's offset; re-resolving at the first guess handles a DST transition between the two.
  const guess = wallClockAsUtc - zoneOffsetMs(timeZone, wallClockAsUtc);
  return new Date(wallClockAsUtc - zoneOffsetMs(timeZone, guess));
}

function zoneOffsetMs(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // `hour12: false` renders midnight as hour 24 on some ICU builds; `h23` does not.
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
