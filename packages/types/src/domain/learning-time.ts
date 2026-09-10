import { z } from "zod";

/**
 * The vocabulary of `/api/events` and the learning-time aggregation (FR-TIME-06,
 * FR-DASH-02).
 */

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
