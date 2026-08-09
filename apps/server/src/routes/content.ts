import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { validate } from "../middleware/validate.js";
import { ContentIdParamsSchema } from "../schemas/content.js";
import {
  getLessonForChild,
  type LessonDetail,
  type LessonListItem,
  listLessonsForChild,
  listSubjectsForChild,
  listTopicsForChild,
  listWorldLessonsForChild,
  listWorlds,
  type SubjectSummary,
  type TopicSummary,
  type WorldSummary,
  type WorldTopicLessons,
} from "../services/contentService.js";

/**
 * The student-facing curriculum read API.
 *
 * Mounted in `routes/index.ts` behind `requireParent` + `requireActiveChild`,
 * so every handler here can assume an ownership-checked `ChildProfile`. The
 * handlers stay thin: all querying, filtering and serialisation lives in
 * `services/contentService.ts` (`backend.md §2`).
 */
export const contentRouter = Router();

/**
 * Reads the `:id` path parameter on routes guarded by
 * `validate({ params: ContentIdParamsSchema })`.
 *
 * Express 5 types every param as `string | string[]` because a repeated segment
 * can produce an array. The cast is safe only *after* that middleware has run:
 * it replaced `req.params` with the Zod-parsed object, where `id` is a uuid
 * string or the request never reached the handler (400 `VALIDATION_FAILED`).
 */
function idParam(req: Request): string {
  return req.params.id as string;
}

contentRouter.get("/worlds", async (_req, res, next) => {
  try {
    const body: SuccessEnvelope<{ worlds: WorldSummary[] }> = {
      data: { worlds: await listWorlds() },
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

contentRouter.get(
  "/worlds/:id/lessons",
  validate({ params: ContentIdParamsSchema }),
  async (req, res, next) => {
    try {
      const topics = await listWorldLessonsForChild(
        activeChild(req),
        idParam(req),
      );
      const body: SuccessEnvelope<{ topics: WorldTopicLessons[] }> = {
        data: { topics },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.get("/subjects", async (req, res, next) => {
  try {
    const subjects = await listSubjectsForChild(activeChild(req));
    const body: SuccessEnvelope<{ subjects: SubjectSummary[] }> = {
      data: { subjects },
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

contentRouter.get(
  "/subjects/:id/topics",
  validate({ params: ContentIdParamsSchema }),
  async (req, res, next) => {
    try {
      const topics = await listTopicsForChild(activeChild(req), idParam(req));
      const body: SuccessEnvelope<{ topics: TopicSummary[] }> = {
        data: { topics },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.get(
  "/topics/:id/lessons",
  validate({ params: ContentIdParamsSchema }),
  async (req, res, next) => {
    try {
      const lessons = await listLessonsForChild(activeChild(req), idParam(req));
      const body: SuccessEnvelope<{ lessons: LessonListItem[] }> = {
        data: { lessons },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);

contentRouter.get(
  "/lessons/:id",
  validate({ params: ContentIdParamsSchema }),
  async (req, res, next) => {
    try {
      const lesson = await getLessonForChild(
        activeChild(req),
        idParam(req),
        req.log,
      );
      const body: SuccessEnvelope<{ lesson: LessonDetail }> = {
        data: { lesson },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
