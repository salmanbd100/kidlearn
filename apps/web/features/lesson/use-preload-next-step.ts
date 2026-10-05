"use client";

import type { LessonDetailResponse } from "@kidlearn/types";
import { useEffect, useRef } from "react";

/**
 * Cap on warmed images: a large definition must not open a dozen connections on a phone still
 * streaming video.
 */
const MAX_PRELOADED_IMAGES = 8;

/**
 * Narration and clips share the payload; an `Image` handed an mp3 downloads it in full and decodes
 * nothing.
 */
const NON_IMAGE_URL =
  /\.(mp3|wav|ogg|m4a|aac|mp4|webm|mov)(\?|#|$)|\/(video|raw)\/upload\//i;

function collectAssetUrls(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (value.startsWith("https://") && !NON_IMAGE_URL.test(value)) {
      found.add(value);
    }
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

    const urls = new Set<string>();
    collectAssetUrls(activity.definition, urls);
    for (const url of [...urls].slice(0, MAX_PRELOADED_IMAGES)) {
      // `new Image()`, not `next/image`: this only fills the HTTP cache, nothing is displayed. Low
      // priority so the video keeps the bandwidth.
      const image = new Image();
      image.fetchPriority = "low";
      image.src = url;
    }
  }, [lesson, isActive]);
}
