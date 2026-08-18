import { z } from "zod";
import {
  ActivityEventTypeSchema,
  LearningTimeRangeSchema,
} from "../learning-time.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/events` and `/api/children/{id}/learning-time` — the response half of
 * server-derived learning time (FR-TIME-06, FR-DASH-02).
 *
 * Every number here is the server's arithmetic over `SessionEvent` rows the
 * server timestamped. No time in this file came from a client — there is no
 * request shape anywhere that carries a timestamp, a duration or a total, which
 * is what makes refreshing, clearing storage or editing client state unable to
 * change a recorded minute.
 */

/**
 * The answer to a heartbeat.
 *
 * `recorded: false` is a **success**, not a rejection: the server dropped a beat
 * that arrived too soon after the previous one, and the child's time is unaffected
 * either way. A client must not retry on it — the next tick is the retry.
 *
 * `minutesToday` is sent on every beat, dropped or not, because it is the student
 * session's own view of its total. File 28 checks a daily limit against it without
 * a parent-scoped call, which is why it is here rather than on a separate endpoint
 * a limit check would have to poll in addition.
 */
export const HeartbeatSchema = z
  .object({
    recorded: z.boolean(),
    /** Whole minutes, in the deployment's `APP_TIMEZONE` day. */
    minutesToday: z.number().int().min(0),
  })
  .strict();

export type HeartbeatResponse = z.infer<typeof HeartbeatSchema>;

export const HeartbeatResponseSchema = ok(HeartbeatSchema);

/**
 * The acknowledgement of a recorded activity event.
 *
 * `occurredAt` is the server's timestamp — the request carried none to echo. It is
 * returned so a client can see its own clock skew against the row that was
 * actually written.
 *
 * `type` is the same five-member union the request is restricted to, not Prisma's
 * whole `SessionEventType`: this endpoint cannot record a `heartbeat` or a
 * `session_start`, so a client reading the acknowledgement should not have to
 * handle one coming back.
 */
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

/**
 * Minutes learned in one window (FR-DASH-02).
 *
 * `from` and `to` are the window's own edges, not the moment it was asked for:
 * `[from, to)` is a whole calendar period in the deployment's `APP_TIMEZONE`, so
 * `to` for `today` is the coming midnight rather than now. A caller charting the
 * period therefore has its bounds without recomputing them in a timezone it does
 * not know.
 *
 * `minutes` is derived from heartbeat density, not from a stored counter: events
 * closer together than 90 seconds belong to one sitting, and each sitting is
 * credited the 30-second interval its last beat stands for. So an idle tab
 * contributes nothing and a closed one stops counting where it stopped beating.
 */
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
