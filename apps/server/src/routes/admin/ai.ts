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

/** `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08). */
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

/**
 * Reads the `:id` path parameter, on routes guarded by
 * `validate({ params: AiJobIdParamsSchema })`.
 */
function jobIdParam(req: Request): string {
  return req.params.id as string;
}

/**
 * The human gate. Everything above creates drafts; nothing above can publish one.
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

/** Approve, which publishes (FR-CMS-06). */
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
