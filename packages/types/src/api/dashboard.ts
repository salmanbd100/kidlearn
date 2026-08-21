import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/children/{id}/dashboard` — everything the parent dashboard renders, in
 * one response (FR-DASH-01..04).
 *
 * One endpoint rather than four because the screen is one screen: minutes,
 * subject progress and the activity feed are read together on every visit, and
 * four calls behind a PIN gate would mean four chances for a lapsed grant to
 * leave half a dashboard on screen.
 *
 * Deviation from the implementation spec, which put these in
 * `packages/types/src/dashboard.ts`: the non-`api/` files in this package hold
 * vocabulary *both halves of the wire* share — a request enum the client validates
 * against as well. This endpoint has no request shape beyond a path parameter, so
 * everything here is response-only and belongs in `api/` (`backend.md §7`).
 */

/**
 * A display string in both locales, rather than one already resolved.
 *
 * Every other localised response in this API resolves server-side to the *child's*
 * `preferredLanguage` (`contentService.ts`). This one cannot: the reader is the
 * parent, their dashboard language is an i18next choice the server never sees, and
 * there is no parent language column to read it from. A Bangla-learning child's
 * parent reading the dashboard in English would otherwise get Bangla lesson titles
 * inside English chrome.
 *
 * `bn` is nullable because Bangla is best-effort (`lib/locale.ts` on the server):
 * `en` is the one string guaranteed to exist, so it is the only safe fallback.
 */
export const LocalizedLabelSchema = z
  .object({
    en: z.string(),
    bn: z.string().nullable(),
  })
  .strict();

export type LocalizedLabel = z.infer<typeof LocalizedLabelSchema>;

/**
 * Minutes learned in the three windows the dashboard shows at once (FR-DASH-02).
 *
 * All three come from the same `getLearningMinutes` the screen-time limit and
 * `GET /api/children/{id}/learning-time` use, so a figure here can never disagree
 * with the one that blocked a lesson. The window bounds are deliberately absent:
 * `learning-time` returns them for a caller charting a period, and this screen
 * renders three labelled cards rather than a chart.
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

/**
 * One subject's completion, for the progress bars (FR-DASH-03).
 *
 * `completed` and `total` travel alongside `percent` because "9 of 26" is what a
 * parent acts on and a rounded percentage alone cannot be turned back into it.
 *
 * A subject with `total === 0` is never in the list: it has no lessons for this
 * child's grade, so a 0% bar would report an empty curriculum as a child's
 * failure. `percent` is therefore always a real fraction and never `NaN`.
 */
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

/**
 * The three things that appear in the activity feed (FR-DASH-04).
 *
 * A closed set rather than free text so the client can key an icon off it. There
 * is deliberately no `lesson_started` or `quiz_attempted`: the feed is what a
 * parent can congratulate a child for, and a list of abandoned attempts is a
 * record of failure sitting on the family's dashboard.
 */
export const DASHBOARD_ACTIVITY_TYPES = [
  "lesson_completed",
  "story_completed",
  "badge_earned",
] as const;

export const DashboardActivityTypeSchema = z.enum(DASHBOARD_ACTIVITY_TYPES);
export type DashboardActivityType = z.infer<typeof DashboardActivityTypeSchema>;

/** How many feed entries the endpoint returns, newest first (FR-DASH-04). */
export const RECENT_ACTIVITY_LIMIT = 20;

/**
 * One entry in the feed.
 *
 * `refId` names the lesson, story or badge, not the row that recorded it — a
 * client linking somewhere from a feed entry wants the thing, and the ledger row's
 * own id is of no use to anybody outside the server.
 *
 * `occurredAt` is the server's timestamp in every case: `LessonProgress.completedAt`
 * for a lesson and `RewardLedger.createdAt` for the other two. Nothing a client
 * ever sent contributes to it.
 */
export const DashboardActivityItemSchema = z
  .object({
    type: DashboardActivityTypeSchema,
    refId: z.string(),
    title: LocalizedLabelSchema,
    occurredAt: IsoDateTimeSchema,
  })
  .strict();

export type DashboardActivityItem = z.infer<typeof DashboardActivityItemSchema>;

/**
 * The whole dashboard (FR-DASH-01).
 *
 * `strongestSubjectId` and `weakestSubjectId` are both `null` unless there is a
 * genuine comparison to draw — fewer than two subjects with lessons, or every
 * percentage still at zero, and there is no strongest or weakest. A brand-new
 * child has no weak area, and telling a parent their four-year-old's worst subject
 * on day one is a judgement the data does not support (FR-DASH-03).
 *
 * When they are set they name a member of `subjects`, so the client resolves a chip
 * by id rather than being handed a second copy of a subject's name.
 */
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
