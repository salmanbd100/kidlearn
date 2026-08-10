"use client";

/**
 * The five-minute teaching video (FR-LSN-02).
 *
 * Placeholder. File 17 replaces the body with the real player over `videoUrl`
 * and `videoPosterUrl`, including the locale-fallback flag it reports on the
 * `step_complete` event.
 */
import type { LessonStepProps } from "./lesson-step-props";
import { StepPlaceholder } from "./StepPlaceholder";

export function VideoStep({ lesson, onComplete }: LessonStepProps) {
  return (
    <StepPlaceholder
      step="video"
      title={lesson.title}
      onComplete={onComplete}
    />
  );
}
