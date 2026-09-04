import type {
  AiJobCount,
  BatchGenerationRef,
  GenerationJobRef,
} from "@kidlearn/types";
import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { adminContext } from "../../middleware/require-admin.js";
import { requireGenerationBudget } from "../../middleware/require-generation-budget.js";
import { validate, validatedQuery } from "../../middleware/validate.js";
import {
  AiJobIdParamsSchema,
  type AiJobListQuery,
  AiJobListQuerySchema,
  GenerateIllustrationsSchema,
  GenerateLessonSchema,
  GenerateNarrationSchema,
  GenerateQuizSchema,
  GenerateStorySchema,
  RejectJobSchema,
} from "../../schemas/admin-ai.js";
import { generateIllustrationBatch } from "../../services/ai/generators/illustration.js";
import { generateLesson } from "../../services/ai/generators/lesson.js";
import { generateNarrationBatch } from "../../services/ai/generators/narration.js";
import { generateQuiz } from "../../services/ai/generators/quiz.js";
import { generateStory } from "../../services/ai/generators/story.js";
import {
  type AiJobDetailDto,
  type AiJobListDto,
  type AiReviewResultDto,
  approveJob,
  countAwaitingReview,
  getJob,
  listJobs,
  rejectJob,
} from "../../services/ai/review.js";

/**
 * `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08).
 *
 * Mounted inside `adminRouter`, so `requireAdmin` guards every path here by
 * construction. File 35 added the story and quiz generators as further paths on
 * this router; file 36 added the audio and image ones the same way.
 *
 * **Generation is awaited inline, and `202` says so honestly.** A lesson takes
 * tens of seconds to write, which is a long request — but this service runs on a
 * free tier with no worker, no queue and no durable retry, so a background job
 * would be a promise the deployment cannot keep. `202` rather than `201` because
 * what the caller gets back is a job to look up in the review queue, not a lesson
 * they can use: nothing generated here is visible to a child, and an admin has to
 * approve it first (FR-AI-07).
 *
 * **Every path carries `requireGenerationBudget` (file 36).** The three cost
 * buckets are independent, so each route names its own — a day spent narrating a
 * story must not stop somebody writing a lesson. It is on the route rather than
 * inside the generators so the ceiling is visible where the endpoints are, and it
 * runs before validation's expensive neighbour rather than after the model has
 * been called.
 *
 * **The post-MVP path is a queue**, and the shape above is what makes it a
 * drop-in: the response is already a job reference, so moving the work off the
 * request thread changes when the row reaches `awaiting_review` and nothing a
 * client reads.
 */
export const adminAiRouter = Router();

adminAiRouter.post(
  "/generate/lesson",
  requireGenerationBudget("lesson"),
  validate({ body: GenerateLessonSchema }),
  async (req, res, next) => {
    try {
      const result = await generateLesson(req.body);

      const payload: SuccessEnvelope<GenerationJobRef> = { data: result };
      res.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminAiRouter.post(
  "/generate/story",
  requireGenerationBudget("story"),
  validate({ body: GenerateStorySchema }),
  async (req, res, next) => {
    try {
      const result = await generateStory(req.body);

      const payload: SuccessEnvelope<GenerationJobRef> = { data: result };
      res.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminAiRouter.post(
  "/generate/quiz",
  requireGenerationBudget("quiz"),
  validate({ body: GenerateQuizSchema }),
  async (req, res, next) => {
    try {
      const result = await generateQuiz(req.body);

      const payload: SuccessEnvelope<GenerationJobRef> = { data: result };
      res.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Narration for every missing `(target, locale)` pair (FR-AI-04, FR-I18N-05).
 *
 * Answers with `{ jobIds, skipped }` rather than one job reference, because one
 * click here creates *n* jobs — one per clip, since one clip is what a reviewer
 * approves. An empty `jobIds` with a non-zero `skipped` is the ordinary result of
 * re-running the action on work that is already done, and is still a `202`:
 * nothing was wrong with the request.
 */
adminAiRouter.post(
  "/generate/narration",
  requireGenerationBudget("audio"),
  validate({ body: GenerateNarrationSchema }),
  async (req, res, next) => {
    try {
      const result = await generateNarrationBatch(req.body);

      const payload: SuccessEnvelope<BatchGenerationRef> = { data: result };
      res.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/** Illustrations for every story page with a brief and no picture (FR-AI-05). */
adminAiRouter.post(
  "/generate/illustrations",
  requireGenerationBudget("image"),
  validate({ body: GenerateIllustrationsSchema }),
  async (req, res, next) => {
    try {
      const result = await generateIllustrationBatch(req.body);

      const payload: SuccessEnvelope<BatchGenerationRef> = { data: result };
      res.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  },
);

// --- The review queue (file 37, FR-AI-07, FR-CMS-05..06) ------------------

/**
 * Reads the `:id` path parameter, on routes guarded by
 * `validate({ params: AiJobIdParamsSchema })`.
 *
 * Express 5 types every param as `string | string[]`, because a repeated segment
 * can produce an array. The cast is safe only *after* that middleware has run: it
 * replaced `req.params` with the Zod-parsed object, in which `id` is a uuid
 * string — or the request never reached the handler (`400 VALIDATION_FAILED`).
 * Same reasoning as `idParam` in `routes/admin/content.ts`.
 */
function jobIdParam(req: Request): string {
  return req.params.id as string;
}

/**
 * The human gate. Everything above creates drafts; nothing above can publish one.
 *
 * `/jobs/count` is registered before `/jobs/:id` because Express matches in
 * registration order and `count` is a valid path segment — the reverse order
 * would send every badge poll into the detail handler, where the uuid params
 * schema would answer a confusing `400` about `id`.
 */
adminAiRouter.get(
  "/jobs",
  validate({ query: AiJobListQuerySchema }),
  async (_req, res, next) => {
    try {
      const query = validatedQuery<AiJobListQuery>(res);

      const payload: SuccessEnvelope<AiJobListDto> = {
        data: await listJobs(query),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

adminAiRouter.get("/jobs/count", async (_req, res, next) => {
  try {
    const payload: SuccessEnvelope<AiJobCount> = {
      data: await countAwaitingReview(),
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

adminAiRouter.get(
  "/jobs/:id",
  validate({ params: AiJobIdParamsSchema }),
  async (req, res, next) => {
    try {
      const payload: SuccessEnvelope<AiJobDetailDto> = {
        data: await getJob(jobIdParam(req)),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Approve, which publishes (FR-CMS-06).
 *
 * One action rather than approve-then-publish, because FR-CMS-06 says approved
 * content is published immediately and a second step is a second thing to forget
 * — leaving reviewed content invisible for no reason a child benefits from. What
 * it publishes is every row the job created, walked through file 32's matrix one
 * legal hop at a time.
 *
 * No body. There is nothing to say: the reviewer's identity comes from the
 * session and what to publish comes from the job's foreign keys. A body naming
 * rows to include would be a way to publish half a lesson.
 */
adminAiRouter.post(
  "/jobs/:id/approve",
  validate({ params: AiJobIdParamsSchema }),
  async (req, res, next) => {
    try {
      const admin = adminContext(req);

      const payload: SuccessEnvelope<AiReviewResultDto> = {
        data: await approveJob(jobIdParam(req), admin.id),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);

/** Reject, with a mandatory reason of at least ten characters (FR-AI-08). */
adminAiRouter.post(
  "/jobs/:id/reject",
  validate({ params: AiJobIdParamsSchema, body: RejectJobSchema }),
  async (req, res, next) => {
    try {
      const admin = adminContext(req);

      const payload: SuccessEnvelope<AiReviewResultDto> = {
        data: await rejectJob(jobIdParam(req), admin.id, req.body.reason),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  },
);
