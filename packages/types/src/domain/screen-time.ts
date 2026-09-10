import { z } from "zod";

// The vocabulary of parental screen-time control (FR-TIME-01..05).

/**
 * The daily limits the picker offers, in minutes. `null` — "off" — is the absence
 * of a limit and is not a member here.
 */
export const SCREEN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60, 90] as const;
export type ScreenTimeLimitOption = (typeof SCREEN_TIME_LIMIT_OPTIONS)[number];

/** 24-hour `"HH:MM"`. Anchored, so `"25:00"` and `"9:5"` are both rejected. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TimeOfDaySchema = z.string().regex(TIME_OF_DAY_PATTERN, {
  message: "must be a 24-hour time of day, e.g. 07:30",
});

/** Why a child may not start something new. */
export const SCREEN_TIME_BLOCK_CODES = [
  "TIME_LIMIT_REACHED",
  "OUTSIDE_WINDOW",
] as const;
export const ScreenTimeBlockCodeSchema = z.enum(SCREEN_TIME_BLOCK_CODES);
export type ScreenTimeBlockCode = z.infer<typeof ScreenTimeBlockCodeSchema>;

/**
 * `PATCH /api/children/{id}/screen-time` — the whole setting, always sent whole.
 */
export const ScreenTimeUpdateSchema = z
  .object({
    dailyLimitMinutes: z
      .union([
        z.literal(15),
        z.literal(30),
        z.literal(45),
        z.literal(60),
        z.literal(90),
      ])
      .nullable(),
    windowStart: TimeOfDaySchema.nullable(),
    windowEnd: TimeOfDaySchema.nullable(),
  })
  .strict()
  .refine(
    (value) => (value.windowStart === null) === (value.windowEnd === null),
    {
      message: "windowStart and windowEnd must be set together",
      path: ["windowEnd"],
    },
  );

export type ScreenTimeUpdate = z.infer<typeof ScreenTimeUpdateSchema>;

/** The union above, spelled out for the picker. */
const _limitOptionsMatchSchema: [
  ScreenTimeLimitOption extends ScreenTimeUpdate["dailyLimitMinutes"]
    ? true
    : never,
  NonNullable<
    ScreenTimeUpdate["dailyLimitMinutes"]
  > extends ScreenTimeLimitOption
    ? true
    : never,
] = [true, true];
void _limitOptionsMatchSchema;
