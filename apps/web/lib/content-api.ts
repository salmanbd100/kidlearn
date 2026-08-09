import type {
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
