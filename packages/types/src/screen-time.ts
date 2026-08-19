import { z } from "zod";

/**
 * The vocabulary of parental screen-time control (FR-TIME-01..05).
 *
 * Shared rather than server-only because both halves are written by a client: the
 * parent form `safeParse`s the very object `PATCH /api/children/{id}/screen-time`
 * validates with, so a limit the form offers can never be one the server refuses.
 *
 * A time of day is an `"HH:MM"` string here and a `@db.Time(0)` column in
 * Postgres. The wire format is the string deliberately — a window is a wall-clock
 * fact about a household's evening, not an instant, so sending it as a timestamp
 * would attach a date and a zone that mean nothing and would be wrong twice a year
 * in any zone that observes DST.
 */

/**
 * The daily limits the picker offers, in minutes. `null` — "off" — is the absence
 * of a limit and is not a member here.
 *
 * A closed set rather than a free number, and the set is the contract: an
 * arbitrary limit invites a parent to type 7, and a 7-minute allowance is a child
 * being cut off mid-lesson every single day. The steps are wide enough that the
 * next one up is a real change.
 */
export const SCREEN_TIME_LIMIT_OPTIONS = [15, 30, 45, 60, 90] as const;
export type ScreenTimeLimitOption = (typeof SCREEN_TIME_LIMIT_OPTIONS)[number];

/** 24-hour `"HH:MM"`. Anchored, so `"25:00"` and `"9:5"` are both rejected. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TimeOfDaySchema = z.string().regex(TIME_OF_DAY_PATTERN, {
  message: "must be a 24-hour time of day, e.g. 07:30",
});

/**
 * Why a child may not start something new.
 *
 * Two codes rather than one, for the reason the PIN gate splits its 403: the
 * child's next screen differs. `TIME_LIMIT_REACHED` is "come back tomorrow";
 * `OUTSIDE_WINDOW` is "come back at 8 o'clock" — and the second one can name the
 * hour, which is the difference between a child who waits and a child who thinks
 * the app is broken.
 */
export const SCREEN_TIME_BLOCK_CODES = [
  "TIME_LIMIT_REACHED",
  "OUTSIDE_WINDOW",
] as const;
export const ScreenTimeBlockCodeSchema = z.enum(SCREEN_TIME_BLOCK_CODES);
export type ScreenTimeBlockCode = z.infer<typeof ScreenTimeBlockCodeSchema>;

/**
 * `PATCH /api/children/{id}/screen-time` — the whole setting, always sent whole.
 *
 * Not a partial update: the three fields are one policy, and a body that could
 * carry a window without a limit would make "clear the window" indistinguishable
 * from "leave the window alone". Every field is required and nullable instead, so
 * turning something off is a value a parent sends rather than a key they omit.
 *
 * The two window ends must be set or cleared together. Half a window has no
 * meaning the enforcement code could act on — "allowed from 19:00 until
 * unspecified" is not a rule — so it is rejected at the boundary rather than
 * stored and interpreted later.
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

/**
 * The union above, spelled out for the picker.
 *
 * `z.union` of literals rather than `z.enum` because the values are numbers, and
 * the assignment below makes the two lists provably the same set — so a limit
 * added to `SCREEN_TIME_LIMIT_OPTIONS` without widening the schema (or the
 * reverse) is a `pnpm typecheck` failure rather than a picker offering a value the
 * API rejects.
 */
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
