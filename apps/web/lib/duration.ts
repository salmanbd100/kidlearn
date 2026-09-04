/** A minute count as a parent reads it: `"12m"`, `"1h"`, `"1h 35m"`. */
export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export function formatMinutes(total: number, translate: Translate): string {
  // Negative minutes cannot be produced by the API — every figure is a count of
  // recorded presence — but a clamp here is cheaper than a "-1h 25m" on screen.
  const safeTotal = Math.max(0, Math.round(total));

  if (safeTotal < MINUTES_PER_HOUR) {
    return translate("dashboard.durationMinutes", { count: safeTotal });
  }

  const hours = Math.floor(safeTotal / MINUTES_PER_HOUR);
  const minutes = safeTotal % MINUTES_PER_HOUR;

  return minutes === 0
    ? translate("dashboard.durationHours", { count: hours })
    : translate("dashboard.durationHoursMinutes", { hours, minutes });
}

const MINUTES_PER_HOUR = 60;
