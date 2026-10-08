import type {
  LessonDetailResponse,
  Locale,
  StoryDetailResponse,
  StorySummaryResponse,
  WorldSummaryResponse,
  WorldTopicLessonsResponse,
} from "@kidlearn/types";
import { type ApiResult, apiFetch } from "@/shared/api/api-client";

export interface ContentFetchOptions {
  onColdStart?: () => void;
}

/** Admin preview params: the only query parameters on this API. */
export interface LessonPreviewOptions {
  isPreview?: boolean;
  language?: Locale;
}

export function listWorlds(
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ worlds: WorldSummaryResponse[] }>> {
  return apiFetch<{ worlds: WorldSummaryResponse[] }>("/api/content/worlds", {
    onColdStart: options.onColdStart,
  });
}

export function listWorldLessons(
  worldId: string,
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ topics: WorldTopicLessonsResponse[] }>> {
  return apiFetch<{ topics: WorldTopicLessonsResponse[] }>(
    `/api/content/worlds/${worldId}/lessons`,
    { onColdStart: options.onColdStart },
  );
}

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

export function listStories(
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ stories: StorySummaryResponse[] }>> {
  return apiFetch<{ stories: StorySummaryResponse[] }>("/api/content/stories", {
    onColdStart: options.onColdStart,
  });
}

export function getStory(
  storyId: string,
  options: ContentFetchOptions = {},
): Promise<ApiResult<{ story: StoryDetailResponse }>> {
  return apiFetch<{ story: StoryDetailResponse }>(
    `/api/content/stories/${storyId}`,
    { onColdStart: options.onColdStart },
  );
}
