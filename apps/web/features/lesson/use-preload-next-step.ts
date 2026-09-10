"use client";

import type { LessonDetailResponse } from "@kidlearn/types";
import { useEffect, useRef } from "react";

/**
 * Warms the activity step while the child is still watching the video
 * (NFR-PERF-02).
 */

const cache = new Map<string, unknown>();

export function activityCacheKey(activityId: string): string {
  return `activity:${activityId}`;
}

/**
 * Reads what the video step warmed. `undefined` means "not preloaded" and never
 * "no activity" — a caller that misses simply renders from the lesson payload.
 */
export function getPreloaded<T>(key: string): T | undefined {
  const value = cache.get(key);
  // Callers pass the key that they themselves wrote, so the pairing of key to
  // type is theirs to keep; nothing in a `Map<string, unknown>` can carry it.
  return value === undefined ? undefined : (value as T);
}

/** Test-only: the cache outlives a render, so a suite must be able to empty it. */
export function clearPreloadCache(): void {
  cache.clear();
}

/** Every https URL nested anywhere inside an activity definition. */
function collectAssetUrls(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith("https://")) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetUrls(item, found);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectAssetUrls(item, found);
  }
}

/** Call once the video is actually playing — not on mount. */
export function usePreloadNextStep(
  lesson: LessonDetailResponse,
  isActive: boolean,
): void {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isActive || hasRun.current) return;
    const { activity } = lesson;
    if (activity === null) return;
    hasRun.current = true;

    cache.set(activityCacheKey(activity.id), activity);

    const urls = new Set<string>();
    collectAssetUrls(activity.definition, urls);
    for (const url of urls) {
      // `new Image()` and not `next/image`: the point is to fill the browser's
      // HTTP cache before anything renders, and nothing here is ever displayed.
      const image = new Image();
      image.src = url;
    }
  }, [lesson, isActive]);
}
