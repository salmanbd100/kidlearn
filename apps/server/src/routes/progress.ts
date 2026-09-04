import type { LessonProgress } from "@kidlearn/db";
import type {
  LessonCompletionResponse,
  LessonProgressResponse,
  LessonStepReport,
  QuizResponsesSubmit,
  QuizScoreResponse,
  SessionEventRecordResponse,
  SessionEventReport,
  StoryCompletionResponse,
} from "@kidlearn/types";
import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { validate } from "../middleware/validate.js";
import {
  LessonIdParamsSchema,
  LessonStepBodySchema,
  QuizIdParamsSchema,
  QuizResponsesBodySchema,
  SessionEventBodySchema,
  StoryIdParamsSchema,
} from "../schemas/progress.js";
import {
  completeLesson,
  getLessonProgress,
  recordQuizResponses,
  recordSessionEvent,
  reportLessonStep,
} from "../services/lessonProgressService.js";
import { completeStory } from "../services/storyProgressService.js";

/** Where the lesson player writes what a child has done (FR-LSN-06..07). */
export const progressRouter = Router();

/**
 * Reads the `:id` path parameter on routes guarded by
 * `validate({ params: LessonIdParamsSchema })`.
 */
function lessonIdParam(req: Request): string {
  return req.params.id as string;
}

/** The same narrowing, for routes guarded by `QuizIdParamsSchema`. */
function quizIdParam(req: Request): string {
  return req.params.quizId as string;
}

/**
 * The same narrowing again, for `StoryIdParamsSchema`. Named rather than reusing
 * `lessonIdParam`: the two read the same path segment and mean different rows,
 * and a handler calling `lessonIdParam` to fetch a story is exactly the confusion
 * a shared helper invites.
 */
function storyIdParam(req: Request): string {
  return req.params.id as string;
}

/**
 * `completedAt` is a `Date` on the row and an ISO string on the wire, which is
 * what `IsoDateTimeSchema` documents. `res.json()` would convert it anyway; doing
 * it here is what makes the handler's type match the published contract instead of
 * only matching it at runtime.
 */
function toResponse(progress: LessonProgress): LessonProgressResponse {
  return {
    lessonId: progress.lessonId,
    currentStep: progress.currentStep,
    completedAt: progress.completedAt?.toISOString() ?? null,
  };
}

progressRouter.get(
  "/lessons/:id",
  validate({ params: LessonIdParamsSchema }),
  async (req, res, next) => {
    try {
      const progress = await getLessonProgress(
        activeChild(req),
        lessonIdParam(req),
      );
      const body: SuccessEnvelope<{
        progress: LessonProgressResponse | null;
      }> = {
        data: { progress: progress === null ? null : toResponse(progress) },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

progressRouter.post(
  "/lessons/:id/step",
  validate({ params: LessonIdParamsSchema, body: LessonStepBodySchema }),
  async (req, res, next) => {
    try {
      const progress = await reportLessonStep(
        activeChild(req),
        lessonIdParam(req),
        // `validate` replaced the body with the parsed object, so this narrows a
        // schema-verified boundary rather than trusting the request.
        req.body as LessonStepReport,
      );
      const body: SuccessEnvelope<{ progress: LessonProgressResponse }> = {
        data: { progress: toResponse(progress) },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/** FR-LSN-05 — finishes the lesson and pays for it. */
progressRouter.post(
  "/lessons/:id/complete",
  validate({ params: LessonIdParamsSchema }),
  async (req, res, next) => {
    try {
      const rewards = await completeLesson(
        activeChild(req),
        lessonIdParam(req),
      );
      const body: SuccessEnvelope<LessonCompletionResponse> = { data: rewards };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/** FR-STORY-06..07 — finishes a story and pays for it, once. */
progressRouter.post(
  "/stories/:id/complete",
  validate({ params: StoryIdParamsSchema }),
  async (req, res, next) => {
    try {
      const completion = await completeStory(
        activeChild(req),
        storyIdParam(req),
      );
      const body: SuccessEnvelope<StoryCompletionResponse> = {
        data: completion,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 201: each POST appends a row to an append-only log, so there is a new resource
 * every time — unlike the step report above, which upserts one.
 */
progressRouter.post(
  "/events",
  validate({ body: SessionEventBodySchema }),
  async (req, res, next) => {
    try {
      const event = await recordSessionEvent(
        activeChild(req),
        req.body as SessionEventReport,
      );
      const body: SuccessEnvelope<{ event: SessionEventRecordResponse }> = {
        data: {
          event: {
            id: event.id,
            type: event.type,
            occurredAt: event.occurredAt.toISOString(),
          },
        },
      };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * 200 rather than 201: the rows are a side effect of scoring, and what a caller
 * is given back is the score — not a resource it could go and read.
 */
progressRouter.post(
  "/quizzes/:quizId/responses",
  validate({ params: QuizIdParamsSchema, body: QuizResponsesBodySchema }),
  async (req, res, next) => {
    try {
      const score = await recordQuizResponses(
        activeChild(req),
        quizIdParam(req),
        req.body as QuizResponsesSubmit,
      );
      const body: SuccessEnvelope<QuizScoreResponse> = { data: score };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
