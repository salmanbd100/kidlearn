import type { GenerationJobRef } from "@kidlearn/types";
import { Router } from "express";
import type { SuccessEnvelope } from "../../lib/errors.js";
import { validate } from "../../middleware/validate.js";
import { GenerateLessonSchema } from "../../schemas/admin-ai.js";
import { generateLesson } from "../../services/ai/generators/lesson.js";

/**
 * `/api/admin/ai` — the generation pipeline (file 34, FR-AI-01, FR-AI-08).
 *
 * Mounted inside `adminRouter`, so `requireAdmin` guards every path here by
 * construction. Files 35–36 add their generators as further paths on this router.
 *
 * **Generation is awaited inline, and `202` says so honestly.** A lesson takes
 * tens of seconds to write, which is a long request — but this service runs on a
 * free tier with no worker, no queue and no durable retry, so a background job
 * would be a promise the deployment cannot keep. `202` rather than `201` because
 * what the caller gets back is a job to look up in the review queue, not a lesson
 * they can use: nothing generated here is visible to a child, and an admin has to
 * approve it first (FR-AI-07).
 *
 * **The post-MVP path is a queue**, and the shape above is what makes it a
 * drop-in: the response is already a job reference, so moving the work off the
 * request thread changes when the row reaches `awaiting_review` and nothing a
 * client reads.
 */
export const adminAiRouter = Router();

adminAiRouter.post(
  "/generate/lesson",
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
