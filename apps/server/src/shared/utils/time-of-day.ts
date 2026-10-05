export function toMinutesOfDay(timeOfDay: string): number {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeOfDayToDate(timeOfDay: string): Date {
  return new Date(`1970-01-01T${timeOfDay}:00.000Z`);
}

export function dateToTimeOfDay(value: Date): string {
  return value.toISOString().slice(11, 16);
}
