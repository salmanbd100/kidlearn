import { z } from "zod";
import { ScreenTimeBlockCodeSchema, TimeOfDaySchema } from "../screen-time.js";
import { ok } from "./envelope.js";

/**
 * `/api/children/{id}/screen-time` and `/api/screen-time/status` — the response
 * half of parental screen-time control (FR-TIME-01..05).
 *
 * Both shapes are all-nullable rather than optional. A household with no
 * `ScreenTimeSetting` row is a household with no limits, which is a policy and not
 * a missing answer, so the read returns nulls instead of a 404 and neither the
 * parent form nor the student surface has a "no row yet" branch to get wrong.
 */

/**
 * The stored policy, as the parent form reads it back.
 *
 * Deliberately the same field names and the same `"HH:MM"` format the write
 * accepts, so the form round-trips its own payload — the reason a saved `07:00`
 * cannot come back as `07:00:00` or as a timestamp (see `lib/time-of-day.ts` on
 * the server, which owns the only conversion).
 */
export const ScreenTimeSettingSchema = z
  .object({
    dailyLimitMinutes: z.number().int().positive().nullable(),
    windowStart: TimeOfDaySchema.nullable(),
    windowEnd: TimeOfDaySchema.nullable(),
  })
  .strict();

export type ScreenTimeSettingResponse = z.infer<typeof ScreenTimeSettingSchema>;

export const ScreenTimeSettingResponseSchema = ok(ScreenTimeSettingSchema);

/**
 * "May this child start something new right now?" — the student surface's own
 * read (FR-TIME-02, FR-TIME-04).
 *
 * It carries the settings as well as the verdict because the lock screens have to
 * say *when* to come back, and `windowStart` is the only thing that can answer
 * that. The client formats it for display and decides nothing: `allowed` is the
 * server's, computed from the same function the enforcement middleware runs, so a
 * client that ignored this would meet a `423` at the content endpoint anyway.
 *
 * `reason` is `null` exactly when `allowed` is true. Two fields rather than one
 * nullable code so a caller can branch on the boolean without knowing the
 * vocabulary, which is what the home screen actually does.
 */
export const ScreenTimeStatusSchema = z
  .object({
    allowed: z.boolean(),
    reason: ScreenTimeBlockCodeSchema.nullable(),
    /** Server-derived minutes for today, in the deployment's `APP_TIMEZONE`. */
    minutesToday: z.number().int().min(0),
    dailyLimitMinutes: z.number().int().positive().nullable(),
    windowStart: TimeOfDaySchema.nullable(),
    windowEnd: TimeOfDaySchema.nullable(),
  })
  .strict();

export type ScreenTimeStatusResponse = z.infer<typeof ScreenTimeStatusSchema>;

export const ScreenTimeStatusResponseSchema = ok(ScreenTimeStatusSchema);
