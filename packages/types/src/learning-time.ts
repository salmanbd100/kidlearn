import { z } from "zod";

/**
 * The vocabulary of `/api/events` and the learning-time aggregation (FR-TIME-06,
 * FR-DASH-02).
 *
 * Shared rather than server-only because both halves of it are written by a
 * client: the student surfaces post activity events, and the parent dashboard
 * names a range in a query string. Neither shape is redeclared in `apps/web`.
 *
 * What is *not* here is any notion of time. A client sends no timestamp and no
 * duration anywhere in this file — the server stamps every row and derives every
 * minute from the rows it stamped, which is the whole of FR-TIME-06.
 */

/**
 * The activity events a student surface may report.
 *
 * A strict subset of Prisma's `SessionEventType`: `heartbeat` has its own
 * endpoint, and `session_start` / `session_end` have no producer. Letting a
 * client name any member of the enum would let it forge the rows a screen-time
 * limit is computed from.
 */
export const ACTIVITY_EVENT_TYPES = [
  "lesson_start",
  "step_complete",
  "lesson_complete",
  "story_start",
  "story_complete",
] as const;
export const ActivityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

/**
 * `POST /api/events/activity` — one discrete thing a child did.
 *
 * `refId` is the lesson or story the event is about, and which of the two is
 * decided by `type` rather than by a second field: a `story_start` naming a
 * lesson id is not a request with a missing key, it is a contradiction, and one
 * field that means "the thing this event is about" cannot express it.
 *
 * The id is resolved server-side through the same visibility rule the content API
 * reads it with, so an event cannot name content the child cannot see.
 */
export const ActivityEventReportSchema = z
  .object({
    type: ActivityEventTypeSchema,
    refId: z.string().min(1),
  })
  .strict();

export type ActivityEventReport = z.infer<typeof ActivityEventReportSchema>;

/**
 * The windows the dashboard asks for. `today` is a calendar day in the
 * deployment's `APP_TIMEZONE`, `week` starts Monday, `month` is the calendar
 * month — never a rolling 7 or 30 days, because a parent comparing "this week"
 * against a school week means the calendar one.
 */
export const LEARNING_TIME_RANGES = ["today", "week", "month"] as const;
export const LearningTimeRangeSchema = z.enum(LEARNING_TIME_RANGES);
export type LearningTimeRange = z.infer<typeof LearningTimeRangeSchema>;
