import { z } from "zod";

/** The vocabulary of `/api/events` and the learning-time aggregation (FR-TIME-06, FR-DASH-02). */

/** The activity events a student surface may report. */
export const ACTIVITY_EVENT_TYPES = [
  "lesson_start",
  "step_complete",
  "lesson_complete",
  "story_start",
  "story_complete",
] as const;
export const ActivityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

/** `POST /api/events/activity` — one discrete thing a child did. */
export const ActivityEventReportSchema = z
  .object({
    type: ActivityEventTypeSchema,
    /** A lesson or story id. Ids are uuids; the cap stops an arbitrary string being carried into a query. */
    refId: z.string().min(1).max(64),
  })
  .strict();

export type ActivityEventReport = z.infer<typeof ActivityEventReportSchema>;

/**
 * The windows the dashboard asks for, as calendar periods in `APP_TIMEZONE` (`week` starts Monday),
 * never rolling 7/30 days: a parent comparing "this week" against a school week means the calendar one.
 */
export const LEARNING_TIME_RANGES = ["today", "week", "month"] as const;
export const LearningTimeRangeSchema = z.enum(LEARNING_TIME_RANGES);
export type LearningTimeRange = z.infer<typeof LearningTimeRangeSchema>;
