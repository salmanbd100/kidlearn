import type { LessonProgress } from "@kidlearn/db";
import type {
  LessonProgressResponse,
  LessonStepReport,
  QuizResponsesSubmit,
  QuizScoreResponse,
  SessionEventRecordResponse,
  SessionEventReport,
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
} from "../schemas/progress.js";
import {
  getLessonProgress,
  recordQuizResponses,
  recordSessionEvent,
  reportLessonStep,
} from "../services/lessonProgressService.js";

/**
 * Where the lesson player writes what a child has done (FR-LSN-06..07).
 *
 * Mounted in `routes/index.ts` behind `requireParent` + `requireActiveChild`, so
 * every handler here can assume an ownership-checked `ChildProfile` — the same
 * arrangement `/api/content/*` uses, and for the same reason: a route added here
 * later cannot forget the guards. The handlers stay thin; the visibility check, the
 * monotonic guard and the server timestamping all live in
 * `services/lessonProgressService.ts` (`backend.md §2`).
 */
export const progressRouter = Router();

/**
 * Reads the `:id` path parameter on routes guarded by
 * `validate({ params: LessonIdParamsSchema })`.
 *
 * Express 5 types every param as `string | string[]`. The cast is safe only
 * *after* that middleware has run: it replaced `req.params` with the Zod-parsed
 * object, where `id` is a uuid string or the request never reached the handler
 * (400 `VALIDATION_FAILED`). Same shape as `routes/content.ts`.
 */
function lessonIdParam(req: Request): string {
  return req.params.id as string;
}

/** The same narrowing, for routes guarded by `QuizIdParamsSchema`. */
function quizIdParam(req: Request): string {
  return req.params.quizId as string;
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
