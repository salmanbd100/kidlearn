"use client";

import type { LessonDetailResponse } from "@kidlearn/types";
import { useEffect, useRef } from "react";

/**
 * Warms the activity step while the child is still watching the video
 * (NFR-PERF-02).
 *
 * The two or three minutes of a lesson video are the only idle network this flow
 * has. Spending them means the activity is on screen the instant the child taps
 * "done", instead of a spinner at the exact moment their attention is highest.
 *
 * **Assets, not the payload.** The spec anticipated a
 * `GET /api/content/activities/:id` fetch here; the settled file-12 contract
 * ships the activity's `definition` inside the lesson response instead, so there
 * is nothing left to request — the request is already paid for. What is *not*
 * paid for is the images that definition points at, and those are the part that
 * would stall a first paint. So this fetches images and publishes the payload it
 * already has under the cache key file 18 reads.
 *
 * **The cache is module-level and never evicted, by design.** It holds at most
 * one lesson's activity at a time in practice, the entries are objects the lesson
 * response already put in memory, and a child moves through one lesson at a time.
 * A cache with a policy would be more code than the thing it manages.
 */

const cache = new Map<string, unknown>();

export function activityCacheKey(activityId: string): string {
  return `activity:${activityId}`;
}

/**
 * Reads what the video step warmed. `undefined` means "not preloaded" and never
 * "no activity" — a caller that misses simply renders from the lesson payload.
 *
 * The cast is unavoidable and is the reason this is a function rather than an
 * exported `Map`: a heterogeneous cache cannot type its own values, so the one
 * unchecked point is here, named, instead of at every call site.
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

/**
 * Every https URL nested anywhere inside an activity definition.
 *
 * Walks the JSON blindly rather than reading known fields: the definition is
 * versioned content whose shape is owned by `@kidlearn/types` and extended by
 * files 18–20, and a preloader that had to be updated for each new activity type
 * would silently stop preloading the newest one.
 */
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

/**
 * Call once the video is actually playing — not on mount.
 *
 * `isActive` rather than a conditional hook call, and a ref rather than an
 * effect dependency: a video that buffers twice re-enters `playing` twice, and
 * warming the same images on every stutter would compete for bandwidth with the
 * film the child is trying to watch.
 */
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
