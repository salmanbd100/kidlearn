/**
 * The two halves of one conversion: `"HH:MM"` on the wire, `@db.Time(0)` in
 * Postgres.
 *
 * Kept in one file, and used by nothing else, so the round trip is tested once
 * rather than re-derived at each call site. Prisma surfaces a `time` column as a
 * `Date` whose date part is meaningless — it fills in 1970-01-01 and reads the
 * clock fields back in UTC — so both directions pin the date and the zone to the
 * same arbitrary constants. Formatting such a value with anything zone-aware
 * (`toLocaleTimeString`, `Intl`) would shift it by the server's offset, which is
 * how a 19:00 bedtime becomes 01:00 on a machine in Dhaka.
 *
 * A window is a wall-clock fact — "after eight in the evening, wherever you are" —
 * so nothing here consults `APP_TIMEZONE`. The zone enters once, in
 * `screenTimeService`, where *now* is rendered into the same `"HH:MM"` vocabulary
 * before the two are compared.
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
