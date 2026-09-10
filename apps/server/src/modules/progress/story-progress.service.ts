import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { requireVisibleStoryId } from "../content/story.service.js";
import { grantStoryCompletion } from "../rewards/reward.service.js";

/** Finishing a story (FR-STORY-06..07). */
export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);
  return grantStoryCompletion(child.id, visibleStoryId);
}
