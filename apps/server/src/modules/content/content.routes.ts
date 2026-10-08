import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import { validate } from "../../shared/middleware/validate.js";
import { enforceScreenTime } from "../screen-time/enforce-screen-time.middleware.js";
import { ContentIdParamsSchema } from "./content.schema.js";
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
} from "./content.service.js";
import { storiesRouter } from "./stories.routes.js";

export const contentRouter = Router();

// Nested so stories inherit this surface's guards. Its routes are listed
// separately in the coverage test's `MOUNTS`, which cannot see through a nested mount.
contentRouter.use("/stories", storiesRouter);

// `as`: `validate({ params: ContentIdParamsSchema })` guarantees a string;
// Express 5 types params as `string | string[]`.
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
  // The lesson-start gate (FR-TIME-02..04). After `validate` so the id is narrowed;
  // on this route, not the world/topic lists, so a blocked child meets the mascot
  // when tapping a lesson rather than errors while browsing.
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
