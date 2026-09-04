import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/children/{id}/dashboard` — everything the parent dashboard renders, in
 * one response (FR-DASH-01..04).
 */

/** A display string in both locales, rather than one already resolved. */
export const LocalizedLabelSchema = z
  .object({
    en: z.string(),
    bn: z.string().nullable(),
  })
  .strict();

export type LocalizedLabel = z.infer<typeof LocalizedLabelSchema>;

/**
 * Minutes learned in the three windows the dashboard shows at once (FR-DASH-02).
 */
export const DashboardLearningMinutesSchema = z
  .object({
    today: z.number().int().min(0),
    week: z.number().int().min(0),
    month: z.number().int().min(0),
  })
  .strict();

export type DashboardLearningMinutes = z.infer<
  typeof DashboardLearningMinutesSchema
>;

/** One subject's completion, for the progress bars (FR-DASH-03). */
export const DashboardSubjectProgressSchema = z
  .object({
    subjectId: z.string(),
    slug: z.string(),
    name: LocalizedLabelSchema,
    completed: z.number().int().min(0),
    total: z.number().int().positive(),
    percent: z.number().int().min(0).max(100),
  })
  .strict();

export type DashboardSubjectProgress = z.infer<
  typeof DashboardSubjectProgressSchema
>;

/** The three things that appear in the activity feed (FR-DASH-04). */
export const DASHBOARD_ACTIVITY_TYPES = [
  "lesson_completed",
  "story_completed",
  "badge_earned",
] as const;

export const DashboardActivityTypeSchema = z.enum(DASHBOARD_ACTIVITY_TYPES);
export type DashboardActivityType = z.infer<typeof DashboardActivityTypeSchema>;

/** How many feed entries the endpoint returns, newest first (FR-DASH-04). */
export const RECENT_ACTIVITY_LIMIT = 20;

/** One entry in the feed. */
export const DashboardActivityItemSchema = z
  .object({
    type: DashboardActivityTypeSchema,
    refId: z.string(),
    title: LocalizedLabelSchema,
    occurredAt: IsoDateTimeSchema,
  })
  .strict();

export type DashboardActivityItem = z.infer<typeof DashboardActivityItemSchema>;

/** The whole dashboard (FR-DASH-01). */
export const DashboardSummarySchema = z
  .object({
    learningMinutes: DashboardLearningMinutesSchema,
    /** Highest percent first; ties by the subject's own `sortOrder`. */
    subjects: z.array(DashboardSubjectProgressSchema),
    strongestSubjectId: z.string().nullable(),
    weakestSubjectId: z.string().nullable(),
    /** Newest first, at most `RECENT_ACTIVITY_LIMIT` entries. */
    recentActivity: z.array(DashboardActivityItemSchema),
  })
  .strict();

/** The payload the `/parent` screen renders. */
export type DashboardData = z.infer<typeof DashboardSummarySchema>;

export const DashboardSummaryResponseSchema = ok(DashboardSummarySchema);
