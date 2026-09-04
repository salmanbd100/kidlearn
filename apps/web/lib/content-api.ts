import type {
  LessonDetailResponse,
  Locale,
  StoryDetailResponse,
  StorySummaryResponse,
  WorldSummaryResponse,
  WorldTopicLessonsResponse,
} from "@kidlearn/types";
import { type ApiResult, apiFetch } from "./api-client";

// Typed wrappers over the student-facing curriculum API.

export interface ContentFetchOptions {
  onColdStart?: () => void;
}

/**
 * The administrator preview (file 33, FR-CMS-04) — the **only** query parameters
 * anywhere on this API, and they are not an exception to the rule above.
 */
export interface LessonPreviewOptions {
  isPreview?: boolean;
  language?: Locale;
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

/** Everything the lesson player needs, in one round trip (FR-LSN-01..05). */
export function getLesson(
  lessonId: string,
  options: ContentFetchOptions & LessonPreviewOptions = {},
): Promise<ApiResult<{ lesson: LessonDetailResponse }>> {
  const query = options.isPreview
    ? `?preview=1&lang=${options.language ?? "en"}`
    : "";

  return apiFetch<{ lesson: LessonDetailResponse }>(
    `/api/content/lessons/${lessonId}${query}`,
    { onColdStart: options.onColdStart },
  );
}

/**
 * The child's whole story library, in one request (FR-STORY-01, FR-STORY-08).
 */
export function listStories(
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ stories: StorySummaryResponse[] }>> {
  return apiFetch<{ stories: StorySummaryResponse[] }>("/api/content/stories", {
    onColdStart: options.onColdStart,
  });
}

/** One story and every one of its pages, in a single request (FR-STORY-02). */
export function getStory(
  storyId: string,
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ story: StoryDetailResponse }>> {
  return apiFetch<{ story: StoryDetailResponse }>(
    `/api/content/stories/${storyId}`,
    { onColdStart: options.onColdStart },
  );
}
