import type {
  StoryDetailResponse,
  StorySummaryResponse,
} from "@kidlearn/types";
import { type Request, Router } from "express";
import type { SuccessEnvelope } from "../../shared/errors/errors.js";
import { activeChild } from "../../shared/middleware/require-active-child.js";
import { validate } from "../../shared/middleware/validate.js";
import { enforceScreenTime } from "../screen-time/enforce-screen-time.middleware.js";
import { ContentIdParamsSchema } from "./content.schema.js";
import { getStoryForChild, listStoriesForChild } from "./story.service.js";

export const storiesRouter = Router();

// `as`: same reasoning as in `content.routes.ts`.
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
  // The story-start gate (FR-TIME-02, FR-TIME-04). No in-progress exemption is
  // needed: the reader holds every page once loaded.
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
