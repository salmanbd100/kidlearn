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

/**
 * FR-LSN-05 — finishes the lesson and pays for it.
 *
 * No body: there is nothing a client could tell this endpoint that the server
 * does not already know better. How many answers were right is read from the
 * stored responses and the amounts are constants in `services/rewardService.ts`,
 * which is the whole of FR-GAM-08 — a request that cannot name a reward cannot
 * buy one. The same holds for everything file 24 added to the response: badges,
 * character unlocks and the streak are all decided from rows the server counted,
 * against a calendar day in `APP_TIMEZONE` rather than a device clock.
 *
 * `200`, not `201`: the ledger rows are a consequence of finishing, and a replay
 * writes none at all, so there is no resource this call reliably creates.
 */
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

/**
 * FR-STORY-06..07 — finishes a story and pays for it, once.
 *
 * Mounted here rather than on `/api/content/stories` because it is a write about
 * what a child has *done*, which is what this surface is; the content router is a
 * read-only view of the catalogue.
 *
 * No body, for the same reason the lesson completion has none: the amounts are
 * constants in `services/rewardService.ts` and there is nothing a client could
 * send that would be believed (FR-GAM-08). A replay answers
 * `alreadyCompleted: true` and writes nothing — reading again is free and
 * unlimited (FR-STORY-06), and this endpoint stays callable every time.
 */
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
