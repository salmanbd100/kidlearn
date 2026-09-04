import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { ContentStatusSchema } from "./admin-content.js";
import { GradeLevelSchema } from "./children.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/** `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08). */
export const GenerationJobRefSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(["awaiting_review", "failed"]),
  })
  .strict();

export type GenerationJobRef = z.infer<typeof GenerationJobRefSchema>;

export const GenerationJobRefResponseSchema = ok(GenerationJobRefSchema);

/** What a batch narration can be asked for (file 36, FR-AI-04). */
export const NARRATION_ENTITIES = ["lesson", "story", "quiz"] as const;
export const NarrationEntitySchema = z.enum(NARRATION_ENTITIES);
export type NarrationEntity = z.infer<typeof NarrationEntitySchema>;

/** The answer to a batch generation — narration or illustrations (file 36). */
export const BatchGenerationRefSchema = z
  .object({
    jobIds: z.array(z.string()),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export type BatchGenerationRef = z.infer<typeof BatchGenerationRefSchema>;

export const BatchGenerationRefResponseSchema = ok(BatchGenerationRefSchema);

/** The review queue (file 37, FR-AI-07, FR-CMS-05..06). */
export const AI_JOB_TYPES = [
  "lesson",
  "story",
  "quiz",
  "audio",
  "image",
] as const;
export const AiJobTypeSchema = z.enum(AI_JOB_TYPES);
export type AiJobType = z.infer<typeof AiJobTypeSchema>;

export const AI_JOB_STATUSES = [
  "pending",
  "generating",
  "awaiting_review",
  "approved",
  "rejected",
  "failed",
] as const;
export const AiJobStatusSchema = z.enum(AI_JOB_STATUSES);
export type AiJobStatus = z.infer<typeof AiJobStatusSchema>;

/** The three decisions a reviewer can record (FR-AI-07). */
export const AI_REVIEW_DECISIONS = [
  "approve",
  "edit_then_approve",
  "reject",
] as const;
export const AiReviewDecisionSchema = z.enum(AI_REVIEW_DECISIONS);
export type AiReviewDecision = z.infer<typeof AiReviewDecisionSchema>;

/** One row in the queue list. */
export const AiJobSummarySchema = z
  .object({
    id: z.string(),
    type: AiJobTypeSchema,
    status: AiJobStatusSchema,
    decision: AiReviewDecisionSchema.nullable(),
    gradeLevels: z.array(GradeLevelSchema),
    languages: z.array(LocaleSchema),
    entityLabel: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    reviewedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type AiJobSummary = z.infer<typeof AiJobSummarySchema>;

/** One content row a job created, as the review screen lists it. */
export const AI_ENTITY_RESOURCES = [
  "lessons",
  "quizzes",
  "activities",
  "stories",
] as const;
export type AiEntityResource = (typeof AI_ENTITY_RESOURCES)[number];

export const AiJobEntitySchema = z
  .object({
    resource: z.enum(AI_ENTITY_RESOURCES),
    id: z.string(),
    label: z.string(),
    status: ContentStatusSchema,
  })
  .strict();

export type AiJobEntity = z.infer<typeof AiJobEntitySchema>;

/**
 * An unattached media asset a job produced, and where approval will attach it.
 */
export const AiJobAssetSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    kind: z.enum(["video", "audio", "image"]),
    language: LocaleSchema.nullable(),
    targetTable: z.string().nullable(),
    targetId: z.string().nullable(),
    /** The words the clip reads, or the resolved prompt a picture was drawn from. */
    sourceText: z.string().nullable(),
    isAttached: z.boolean(),
  })
  .strict();

export type AiJobAsset = z.infer<typeof AiJobAssetSchema>;

/** One job, with everything the review screen renders (FR-CMS-05). */
export const AiJobDetailSchema = AiJobSummarySchema.extend({
  input: z.unknown(),
  rawOutput: z.unknown(),
  reviewerId: z.string().nullable(),
  reviewNote: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
  entities: z.array(AiJobEntitySchema),
  assets: z.array(AiJobAssetSchema),
  /**
   * Why this job cannot be approved right now, or an empty list when it can.
   * Computed server-side so the button and the `409` agree — a client deciding
   * for itself would offer an approval the server refuses.
   */
  blockers: z.array(z.string()),
}).strict();

export type AiJobDetail = z.infer<typeof AiJobDetailSchema>;

/** A page of the queue, oldest first. */
export const AiJobListSchema = z
  .object({
    jobs: z.array(AiJobSummarySchema),
    total: z.number().int().nonnegative(),
  })
  .strict();

export type AiJobList = z.infer<typeof AiJobListSchema>;

/** The sidebar badge's one number (requirement 8). */
export const AiJobCountSchema = z
  .object({ awaitingReview: z.number().int().nonnegative() })
  .strict();

export type AiJobCount = z.infer<typeof AiJobCountSchema>;

/**
 * What a decision answers with: the job as it now stands, plus what it moved.
 */
export const AiReviewResultSchema = z
  .object({
    job: AiJobDetailSchema,
    publishedEntities: z.array(AiJobEntitySchema),
    rejectedEntities: z.array(AiJobEntitySchema),
    attachedAssetIds: z.array(z.string()),
  })
  .strict();

export type AiReviewResult = z.infer<typeof AiReviewResultSchema>;

export const AiJobListResponseSchema = ok(AiJobListSchema);
export const AiJobDetailResponseSchema = ok(AiJobDetailSchema);
export const AiJobCountResponseSchema = ok(AiJobCountSchema);
export const AiReviewResultResponseSchema = ok(AiReviewResultSchema);
