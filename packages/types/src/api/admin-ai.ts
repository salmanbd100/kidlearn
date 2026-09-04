import { z } from "zod";
import { LocaleSchema } from "../primitives.js";
import { ContentStatusSchema } from "./admin-content.js";
import { GradeLevelSchema } from "./children.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08).
 *
 * **The response is a job id and nothing else.** Not the lesson, not the quiz,
 * not the model's text. A generation is not a thing an admin accepts at the
 * moment they ask for it — it is a thing that enters the review queue, and
 * returning the content here would invite a client to render it as though it were
 * ready. The drafts are read back through the CMS like any other content.
 *
 * `status` is `awaiting_review` or `failed` — never `approved`, `rejected` or
 * anything that implies a human has looked. A `failed` job still has a row, and
 * its `rawOutput` holds both attempts for whoever has to work out why.
 */
export const GenerationJobRefSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(["awaiting_review", "failed"]),
  })
  .strict();

export type GenerationJobRef = z.infer<typeof GenerationJobRefSchema>;

export const GenerationJobRefResponseSchema = ok(GenerationJobRefSchema);

/**
 * What a batch narration can be asked for (file 36, FR-AI-04).
 *
 * Here rather than in `apps/server/src/schemas` because both sides need it: the
 * route validates against it and the CMS renders a "Generate narration" button per
 * entity from the same three names.
 */
export const NARRATION_ENTITIES = ["lesson", "story", "quiz"] as const;
export const NarrationEntitySchema = z.enum(NARRATION_ENTITIES);
export type NarrationEntity = z.infer<typeof NarrationEntitySchema>;

/**
 * The answer to a batch generation — narration or illustrations (file 36).
 *
 * **Three numbers, not one.** `jobIds` is the work started; `skipped` is the pairs
 * that already had media or already had a clip in the review queue. Without the
 * second, an eight-page story that produced three jobs looks like five failures,
 * and the admin's next move — click it again — is the wrong one.
 *
 * **`failed` counts the jobs in `jobIds` that produced nothing usable**, and it is
 * here because a batch cannot report failure any other way. The single-job
 * endpoints answer with a `status`, so their callers can say "the model gave us
 * nothing"; a batch has *n* statuses, and dropping them made a revoked provider key
 * on a sixteen-clip story read as "16 clips recorded" — a success message for work
 * that entirely failed. The jobs are still listed in `jobIds`: they exist, they
 * hold their own error, and `failed` is how many of them a reviewer should open
 * first.
 *
 * `jobIds` may be empty with a non-zero `skipped`, which is the ordinary result of
 * re-running the action on finished work. It is a `202` either way: nothing was
 * wrong with the request.
 */
export const BatchGenerationRefSchema = z
  .object({
    jobIds: z.array(z.string()),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export type BatchGenerationRef = z.infer<typeof BatchGenerationRefSchema>;

export const BatchGenerationRefResponseSchema = ok(BatchGenerationRefSchema);

/**
 * The review queue (file 37, FR-AI-07, FR-CMS-05..06).
 *
 * Three enums mirrored from Prisma by hand — this package may not depend on
 * `@kidlearn/db` (see `../index.ts`). The mirrors are checked rather than
 * trusted: `apps/server/src/openapi/paths/admin-ai.ts` carries compile-time
 * assertions that each still matches its Prisma enum, so adding a job type or a
 * decision to `schema.prisma` without adding it here fails `pnpm typecheck`.
 */
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

/**
 * The three decisions a reviewer can record (FR-AI-07).
 *
 * `edit_then_approve` is written by the file-33 editors when they are opened from
 * the queue, before the approval itself, and is deliberately preserved rather than
 * overwritten when the job is later approved: "a human rewrote this before it went
 * live" and "a human read this and let it through" are different facts about the
 * same lesson, and only one of them is recoverable after the event.
 */
export const AI_REVIEW_DECISIONS = [
  "approve",
  "edit_then_approve",
  "reject",
] as const;
export const AiReviewDecisionSchema = z.enum(AI_REVIEW_DECISIONS);
export type AiReviewDecision = z.infer<typeof AiReviewDecisionSchema>;

/**
 * One row in the queue list.
 *
 * `gradeLevels` and `languages` are lifted out of the job's `input` JSON rather
 * than left for the client to dig for: they are the two columns a reviewer scans
 * and the two filters the list offers, and a client parsing a free-form JSONB
 * column to render a table cell is a second source of truth for what a job was
 * asked for. Either may be empty — the media jobs carry neither, because a
 * narration job's language belongs to the clip and its grade to the lesson it was
 * read from.
 *
 * `entityLabel` is the human name of what the job produced — a lesson title, a
 * story title, the words a clip narrates — so the list is readable without
 * opening every row. `null` when the job produced nothing (`failed`).
 */
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

/**
 * One content row a job created, as the review screen lists it.
 *
 * `resource` is the CMS path segment, so the detail page's "open in editor" link
 * is built from the payload rather than from a mapping the client keeps. `status`
 * is what the approve guard reads: anything other than `draft` means somebody has
 * moved the row since it was generated, and the approval is refused rather than
 * driven over the top of it.
 */
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
 *
 * `targetTable`/`targetId` are the foreign key the approval writes — recorded at
 * generation time in the job's `rawOutput` — and are surfaced so the reviewer can
 * see *what the clip is for* rather than only hear it. Nothing student-facing can
 * reach the asset until that key is written (FR-AI-07).
 *
 * Both are `null` when the job recorded no target, which is a real state a failed
 * or hand-triggered generation reaches: an empty string would be a sentinel the
 * client has to know about, and the one that shipped rendered "approving writes it
 * to ." on the review screen.
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

/**
 * One job, with everything the review screen renders (FR-CMS-05).
 *
 * `input` and `rawOutput` are `unknown` on purpose. They are the audit record
 * (FR-AI-08) — verbatim prompts, both model attempts, the token usage — and their
 * shape differs per generator and changes whenever a prompt does. The screen shows
 * them in a JSON inspector rather than typed fields, which is the only rendering
 * that stays true as the generators evolve. Narrowing them here would be a
 * contract nothing can keep.
 *
 * `reviewNote` is non-null exactly on a rejection, and the API requires at least
 * ten characters there.
 */
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

/**
 * A page of the queue, oldest first.
 *
 * Oldest first rather than newest: this is a work queue, and the job that has
 * been waiting longest is the one to review next. `total` is the count matching
 * the filters, not the page, so the screen can say "12 of 40" rather than only
 * showing what fits.
 */
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
 *
 * `published` and `rejected` name the content rows the decision walked through the
 * matrix, so the CMS can say "1 lesson and 1 quiz are now live" instead of leaving
 * an admin to re-open the curriculum tree to find out. `attachedAssetIds` is the
 * media half — the clips and pictures whose foreign key was written.
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
