"use client";

/**
 * The lesson's opening beat — narrated welcome and mascot (FR-LSN-01).
 *
 * Placeholder. File 17 replaces the body with the intro narration: `introScript`
 * spoken from `introAudioUrl` through the shared audio channel, with the mascot
 * on screen. The prop contract does not change when it does.
 */
import type { LessonStepProps } from "./lesson-step-props";
import { StepPlaceholder } from "./StepPlaceholder";

export function IntroStep({ lesson, onComplete }: LessonStepProps) {
  return (
    <StepPlaceholder
      step="intro"
      title={lesson.title}
      onComplete={onComplete}
    />
  );
}
