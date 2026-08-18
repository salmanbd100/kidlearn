import type { ChildProfile } from "@kidlearn/db";
import type { StoryCompletionResponse } from "@kidlearn/types";
import { grantStoryCompletion } from "./rewardService.js";
import { requireVisibleStoryId } from "./storyService.js";

/**
 * Finishing a story (FR-STORY-06..07).
 *
 * Two steps, in this order and for a reason: the story is resolved through the
 * *same* visibility clause `GET /api/content/stories/:id` reads it with, and only
 * then is anything granted. Without the guard first, a uuid a child could not open
 * would still pay out — a draft story would be worth exactly as many stars as a
 * published one.
 *
 * There is no `StoryProgress` table and no row written here beyond the ledger's.
 * "This child finished this story" is one fact, recorded once, in the place the
 * stars were paid from — `storyService` derives a cover's `completed` flag from
 * those same rows, so the badge on the library screen and the balance in the strip
 * can never disagree.
 */
export async function completeStory(
  child: ChildProfile,
  storyId: string,
): Promise<StoryCompletionResponse> {
  const visibleStoryId = await requireVisibleStoryId(child, storyId);
  return grantStoryCompletion(child.id, visibleStoryId);
}
