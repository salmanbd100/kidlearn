import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { requireVisibleStoryId } from "../content/story.service.js";
import { grantStoryCompletion } from "../rewards/reward.service.js";

export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);
  return grantStoryCompletion(child, visibleStoryId);
}
