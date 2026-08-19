import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { enforceScreenTime } from "../middleware/enforce-screen-time.js";
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
import { storiesRouter } from "./stories.js";

/**
 * The student-facing curriculum read API.
 *
 * Mounted in `routes/index.ts` behind `requireParent` + `requireActiveChild`,
 * so every handler here can assume an ownership-checked `ChildProfile`. The
 * handlers stay thin: all querying, filtering and serialisation lives in
 * `services/contentService.ts` (`backend.md §2`).
 */
export const contentRouter = Router();

// The Story Library (file 25). Nested here rather than mounted on `apiRouter` so
// stories inherit this surface's guards instead of repeating them — the reason
// `routes/index.ts` puts them on the mount in the first place. Its routes are
// declared in `openapi/paths/stories.ts` and listed separately in the coverage
// test's `MOUNTS`, which walks a router's own registrations and cannot see through
// a nested mount.
contentRouter.use("/stories", storiesRouter);

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

contentRouter.get("/worlds", async (req, res, next) => {
  try {
    const body: SuccessEnvelope<{ worlds: WorldSummary[] }> = {
      data: { worlds: await listWorlds(activeChild(req)) },
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
  // The lesson-start gate (FR-TIME-02..04). After `validate` so the id is a
  // narrowed string by the time the exemption looks for progress against it, and
  // on this route rather than the world/topic lists: a blocked child should meet
  // the mascot when they tap a lesson, not a wall of errors while browsing.
  enforceScreenTime("lesson"),
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
