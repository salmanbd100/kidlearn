/**
 * The two halves of one conversion: `"HH:MM"` on the wire, `@db.Time(0)` in
 * Postgres.
 */

/** Minutes since local midnight for a `"HH:MM"`. */
export function toMinutesOfDay(timeOfDay: string): number {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A `"HH:MM"` as the `Date` Prisma writes into a `@db.Time(0)` column. */
export function timeOfDayToDate(timeOfDay: string): Date {
  return new Date(`1970-01-01T${timeOfDay}:00.000Z`);
}

/** The inverse: a `@db.Time(0)` value as `"HH:MM"`. Seconds are dropped. */
export function dateToTimeOfDay(value: Date): string {
  return value.toISOString().slice(11, 16);
}
