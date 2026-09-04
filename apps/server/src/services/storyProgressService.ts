import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { grantStoryCompletion } from "./rewardService.js";
import { requireVisibleStoryId } from "./storyService.js";

/** Finishing a story (FR-STORY-06..07). */
export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);
  return grantStoryCompletion(child.id, visibleStoryId);
}
