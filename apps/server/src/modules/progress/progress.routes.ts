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
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import { validate } from "../../shared/middleware/validate.js";
import {
  completeLesson,
  getLessonProgress,
  recordQuizResponses,
  recordSessionEvent,
  reportLessonStep,
} from "./lesson-progress.service.js";
import {
  LessonIdParamsSchema,
  LessonStepBodySchema,
  QuizIdParamsSchema,
  QuizResponsesBodySchema,
  SessionEventBodySchema,
  StoryIdParamsSchema,
} from "./progress.schema.js";
import { completeStory } from "./story-progress.service.js";

export const progressRouter = Router();

function lessonIdParam(req: Request): string {
  return req.params.id as string;
}

function quizIdParam(req: Request): string {
  return req.params.quizId as string;
}

/** Separate from `lessonIdParam`: same path segment, different rows, and reusing one to fetch a story is the confusion a shared helper invites. */
function storyIdParam(req: Request): string {
  return req.params.id as string;
}

/** `completedAt` is a `Date` on the row and an ISO string on the wire; converting here makes the handler's type match the published contract. */
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
        // `validate` replaced the body with the parsed object; this narrows a schema-verified boundary.
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

/** 201: each POST appends to an append-only log, unlike the step report, which upserts one row. */
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

/** 200 not 201: the rows are a side effect of scoring; the caller gets the score, not a readable resource. */
progressRouter.post(
  "/quizzes/:quizId/responses",
  validate({ params: QuizIdParamsSchema, body: QuizResponsesBodySchema }),
  async (req, res, next) => {
    try {
      const score = await recordQuizResponses(
        activeChild(req),
        quizIdParam(req),
        req.body as QuizResponsesSubmit,
        req.log,
      );
      const body: SuccessEnvelope<QuizScoreResponse> = { data: score };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
