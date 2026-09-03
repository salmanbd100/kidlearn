import type { BatchGenerationRef, GenerationJobRef } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { requireGenerationBudget } from "../../middleware/require-generation-budget.js";
import { validate } from "../../middleware/validate.js";
import {
  GenerateIllustrationsSchema,
  GenerateLessonSchema,
  GenerateNarrationSchema,
  GenerateQuizSchema,
  GenerateStorySchema,
} from "../../schemas/admin-ai.js";
import { generateIllustrationBatch } from "../../services/ai/generators/illustration.js";
import { generateLesson } from "../../services/ai/generators/lesson.js";
import { generateNarrationBatch } from "../../services/ai/generators/narration.js";
import { generateQuiz } from "../../services/ai/generators/quiz.js";
import { generateStory } from "../../services/ai/generators/story.js";

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
