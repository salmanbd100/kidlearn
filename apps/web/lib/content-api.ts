import type {
  LessonDetailResponse,
  StorySummaryResponse,
  WorldSummaryResponse,
  WorldTopicLessonsResponse,
} from "@kidlearn/types";
import { type ApiResult, apiFetch } from "./api-client";

/**
 * Typed wrappers over the student-facing curriculum API.
 *
 * Response types come from `@kidlearn/types` — the same schemas the route tests
 * assert the real bodies against — so no shape is redeclared here
 * (`backend.md §7`).
 *
 * What is *not* here is any notion of filtering. These endpoints take no query
 * parameters at all: grade and language are read from the active child's row on
 * the server (FR-PROF-03), so there is nothing a client could pass to widen what
 * a child sees, and nothing it should narrow afterwards. A screen renders what it
 * is given.
 *
 * `onColdStart` is threaded through because these are the first requests a child
 * makes after the API has been idle, and a mascot waking up beats a spinner
 * (NFR-PERF-04).
 */

export interface ContentFetchOptions {
  onColdStart?: () => void;
}

/** The themed worlds the home screen renders (FR-WORLD-01..03, FR-WORLD-05). */
export function listWorlds(
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ worlds: WorldSummaryResponse[] }>> {
  return apiFetch<{ worlds: WorldSummaryResponse[] }>("/api/content/worlds", {
    onColdStart: options.onColdStart,
  });
}

/**
 * One world's lessons, already grouped under their topic headings and already
 * filtered to the child's grade — the world screen's only request.
 */
export function listWorldLessons(
  worldId: string,
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ topics: WorldTopicLessonsResponse[] }>> {
  return apiFetch<{ topics: WorldTopicLessonsResponse[] }>(
    `/api/content/worlds/${worldId}/lessons`,
    { onColdStart: options.onColdStart },
  );
}

/**
 * Everything the lesson player needs, in one round trip (FR-LSN-01..05).
 *
 * Intro script, video url, activity payload and quiz questions all arrive together
 * because the five steps run back to back and a request between two of them would be
 * a stall a child reads as "broken". `activity` and `quiz` may each be `null` — the
 * lesson had none, or the one it points at is not itself published — and the flow
 * handles both.
 */
export function getLesson(
  lessonId: string,
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ lesson: LessonDetailResponse }>> {
  return apiFetch<{ lesson: LessonDetailResponse }>(
    `/api/content/lessons/${lessonId}`,
    { onColdStart: options.onColdStart },
  );
}

/**
 * The child's whole story library, in one request (FR-STORY-01, FR-STORY-08).
 *
 * Twenty covers is a small enough list to send at once, and the alternative —
 * paging a library a child browses by looking at it — would mean a cover that
 * exists but cannot be found. `completed` and the world's palette arrive with each
 * story, so the grid needs nothing else to draw itself.
 */
export function listStories(
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ stories: StorySummaryResponse[] }>> {
  return apiFetch<{ stories: StorySummaryResponse[] }>("/api/content/stories", {
    onColdStart: options.onColdStart,
  });
}
