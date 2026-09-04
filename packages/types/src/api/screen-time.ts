import { z } from "zod";
import { ScreenTimeBlockCodeSchema, TimeOfDaySchema } from "../screen-time.js";
import { ok } from "./envelope.js";

/**
 * `/api/children/{id}/screen-time` and `/api/screen-time/status` — the response
 * half of parental screen-time control (FR-TIME-01..05).
 */

/** The stored policy, as the parent form reads it back. */
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
