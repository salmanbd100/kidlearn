import type {
  StoryDetailResponse,
  StorySummaryResponse,
} from "@kidlearn/types";
import { type Request, Router } from "express";
import { ContentIdParamsSchema } from "../../schemas/content.js";
import {
  getStoryForChild,
  listStoriesForChild,
} from "../../services/storyService.js";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { enforceScreenTime } from "../../shared/middleware/enforce-screen-time.js";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import { validate } from "../../shared/middleware/validate.js";

/** The Story Library read API (FR-STORY-01, 04, 05, 08). */
export const storiesRouter = Router();

/** See the identical helper in `content.routes.ts` for why this cast is safe here. */
function idParam(req: Request): string {
  return req.params.id as string;
}

storiesRouter.get("/", async (req, res, next) => {
  try {
    const stories = await listStoriesForChild(activeChild(req));
    const body: SuccessEnvelope<{ stories: StorySummaryResponse[] }> = {
      data: { stories },
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

storiesRouter.get(
  "/:id",
  validate({ params: ContentIdParamsSchema }),
  // The story-start gate (FR-TIME-02, FR-TIME-04). No in-progress exemption, and
  // none is needed: the reader holds every page once it has them, so a story
  // already open is never interrupted by this gate.
  enforceScreenTime("story"),
  async (req, res, next) => {
    try {
      const story = await getStoryForChild(activeChild(req), idParam(req));
      const body: SuccessEnvelope<{ story: StoryDetailResponse }> = {
        data: { story },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  },
);
