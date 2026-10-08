import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { requireVisibleStoryId } from "../content/story.service.js";
import { grantStoryCompletion } from "../rewards/reward.service.js";
import {
  evaluateStartForChild,
  LESSON_RESUME_CEILING_MS,
  LESSON_RESUME_GRACE_MS,
  screenTimeBlockedError,
} from "../screen-time/screen-time.service.js";

export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);

  await assertStoryWasRead(child.id, visibleStoryId);

  return grantStoryCompletion(child, visibleStoryId);
}

/**
 * The `story_start` the reader posts on opening is the evidence a completion is paid against; the same ceiling as a lesson's resume
 * bounds how old it may be. One started within the resume grace is a reading under way and exempt from the screen-time gate, as a lesson
 * is; an older one is a new sitting and meets the gate `GET /stories/:id` applies.
 */
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
      occurredAt: { gte: new Date(now - LESSON_RESUME_CEILING_MS) },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  if (start === null) {
    throw ApiError.conflict("Story has not been opened", {
      code: "STORY_NOT_STARTED",
    });
  }

  if (now - start.occurredAt.getTime() <= LESSON_RESUME_GRACE_MS) return;

  const decision = await evaluateStartForChild(childId, undefined);
  if (!decision.allowed) throw screenTimeBlockedError(decision);
}
