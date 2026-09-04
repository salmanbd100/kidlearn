import { z } from "zod";
import {
  ActivityEventTypeSchema,
  LearningTimeRangeSchema,
} from "../learning-time.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/events` and `/api/children/{id}/learning-time` — the response half of
 * server-derived learning time (FR-TIME-06, FR-DASH-02).
 */

/** The answer to a heartbeat. */
export const HeartbeatSchema = z
  .object({
    recorded: z.boolean(),
    /** Whole minutes, in the deployment's `APP_TIMEZONE` day. */
    minutesToday: z.number().int().min(0),
  })
  .strict();

export type HeartbeatResponse = z.infer<typeof HeartbeatSchema>;

export const HeartbeatResponseSchema = ok(HeartbeatSchema);

/** The acknowledgement of a recorded activity event. */
export const ActivityEventSchema = z
  .object({
    id: z.string(),
    type: ActivityEventTypeSchema,
    occurredAt: IsoDateTimeSchema,
  })
  .strict();

export type ActivityEventResponse = z.infer<typeof ActivityEventSchema>;

export const ActivityEventResponseSchema = ok(
  z.object({ event: ActivityEventSchema }).strict(),
);

/** Minutes learned in one window (FR-DASH-02). */
export const LearningTimeSchema = z
  .object({
    range: LearningTimeRangeSchema,
    minutes: z.number().int().min(0),
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
  })
  .strict();

export type LearningTimeResponse = z.infer<typeof LearningTimeSchema>;

export const LearningTimeReadResponseSchema = ok(LearningTimeSchema);
