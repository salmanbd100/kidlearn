import { z } from "zod";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/children/{id}/reports` and `/api/admin/jobs/weekly-reports` — the weekly
 * progress report (FR-DASH-05..06).
 */

/** Which encouraging note a week earned (FR-DASH-05). */
export const REPORT_NOTE_KEYS = [
  /** No activity at all — the one note that must not congratulate. */
  "quietWeek",
  /** Seven active days out of seven. */
  "perfectWeek",
  /** High first-attempt accuracy over enough questions to mean something. */
  "quizStar",
  /** Five or more active days. */
  "strongWeek",
  /** Five or more stories finished. */
  "bookworm",
  /** At least one lesson finished. */
  "steadyProgress",
  /** At least one story finished, but no lesson — so nothing above matched. */
  "storyTime",
  /** The fallback: something happened, but nothing was finished. */
  "gentleNudge",
] as const;

export const ReportNoteKeySchema = z.enum(REPORT_NOTE_KEYS);
export type ReportNoteKey = z.infer<typeof ReportNoteKeySchema>;

/** One badge earned inside the week. */
export const WeeklyReportBadgeSchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();

export type WeeklyReportBadge = z.infer<typeof WeeklyReportBadgeSchema>;

/**
 * Everything FR-DASH-05 asks a week to report, as stored in `WeeklyReport.metrics`.
 */
export const WeeklyReportMetricsSchema = z
  .object({
    /** Distinct local calendar days with at least one recorded event, 0–7. */
    activeDays: z.number().int().min(0).max(7),
    /** From the same density rule the dashboard and screen-time limit use. */
    learningMinutes: z.number().int().min(0),
    newLetters: z.array(z.string()),
    newWords: z.array(z.string()),
    newNumbers: z.array(z.string()),
    lessonsCompleted: z.number().int().min(0),
    storiesCompleted: z.number().int().min(0),
    /** First-attempt accuracy as a whole percent; `null` when nothing was answered. */
    quizAccuracy: z.number().int().min(0).max(100).nullable(),
    /** How many distinct questions the accuracy above is an average of. */
    quizFirstAttempts: z.number().int().min(0),
    /** How many of those first attempts were right. */
    quizFirstAttemptsCorrect: z.number().int().min(0),
    badgesEarned: z.array(WeeklyReportBadgeSchema),
    noteKey: ReportNoteKeySchema,
    /**
     * Interpolation values for the note's template — e.g. `{ activeDays: 7 }`.
     */
    noteParams: z.record(z.union([z.string(), z.number()])),
  })
  .strict();

export type WeeklyReportMetrics = z.infer<typeof WeeklyReportMetricsSchema>;

/** One week's report as the parent screen reads it. */
export const WeeklyReportSchema = z
  .object({
    weekStart: IsoDateTimeSchema,
    /** The Sunday of the same week, inclusive. */
    weekEnd: IsoDateTimeSchema,
    metrics: WeeklyReportMetricsSchema,
    note: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export type WeeklyReport = z.infer<typeof WeeklyReportSchema>;

/** Newest week first, so `reports[0]` is the card and the rest are the history. */
export const WeeklyReportListSchema = z
  .object({ reports: z.array(WeeklyReportSchema) })
  .strict();

export type WeeklyReportList = z.infer<typeof WeeklyReportListSchema>;

export const WeeklyReportListResponseSchema = ok(WeeklyReportListSchema);

/** What the cron job answers (`POST /api/admin/jobs/weekly-reports`). */
export const WeeklyReportJobResultSchema = z
  .object({
    childrenProcessed: z.number().int().min(0),
    weekStart: IsoDateTimeSchema,
  })
  .strict();

export type WeeklyReportJobResult = z.infer<typeof WeeklyReportJobResultSchema>;

export const WeeklyReportJobResponseSchema = ok(WeeklyReportJobResultSchema);
