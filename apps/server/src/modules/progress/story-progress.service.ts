import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { requireVisibleStoryId } from "../content/story.service.js";
import { grantStoryCompletion } from "../rewards/reward.service.js";

/** How old a `story_start` may be and still count as the opening of the reading being completed. */
const STORY_START_CEILING_MS = 3 * 60 * 60_000;

export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);

  await assertStoryWasRead(child.id, visibleStoryId);

  return grantStoryCompletion(child, visibleStoryId);
}

/** The `story_start` the reader posts on opening is the evidence a completion is paid against. */
async function assertStoryWasRead(
  childId: string,
  storyId: string,
): Promise<void> {
  const now = Date.now();
  const start = await prisma.sessionEvent.findFirst({
    where: {
      childId,
      type: "story_start",
      payload: { path: ["refId"], equals: storyId },
      occurredAt: { gte: new Date(now - STORY_START_CEILING_MS) },
    },
    orderBy: { occurredAt: "desc" },
    select: { id: true },
  });
  if (start === null) {
    throw ApiError.conflict("Story has not been opened", {
      code: "STORY_NOT_STARTED",
    });
  }
}
