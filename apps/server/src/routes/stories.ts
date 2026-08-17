import type {
  StoryDetailResponse,
  StorySummaryResponse,
} from "@kidlearn/types";
import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../lib/errors.js";
import { activeChild } from "../middleware/require-active-child.js";
import { validate } from "../middleware/validate.js";
import { ContentIdParamsSchema } from "../schemas/content.js";
import {
  getStoryForChild,
  listStoriesForChild,
} from "../services/storyService.js";

/**
 * The Story Library read API (FR-STORY-01, 04, 05, 08).
 *
 * Mounted on `contentRouter` at `/stories` rather than on `apiRouter` directly, so
 * it inherits the `requireParent` + `requireActiveChild` pair `/api/content/*`
 * already carries and every handler here can assume an ownership-checked
 * `ChildProfile` — one gate for the whole content surface rather than a second
 * copy that could be forgotten.
 *
 * Handlers stay thin: querying, visibility and locale resolution all live in
 * `services/storyService.ts` (`backend.md §2`).
 */
export const storiesRouter = Router();

/** See the identical helper in `content.ts` for why this cast is safe here. */
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
