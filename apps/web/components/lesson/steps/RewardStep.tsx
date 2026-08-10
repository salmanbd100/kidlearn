"use client";

/**
 * The celebration (FR-LSN-05, FR-GAM-01..02).
 *
 * Placeholder. File 23 replaces the body with the real ceremony driven by the
 * server's completion response — star burst, coin count-up, mascot cheer. The
 * grants themselves are computed server-side; this step renders what it is told.
 */
import type { LessonStepProps } from "./lesson-step-props";
import { StepPlaceholder } from "./StepPlaceholder";

export function RewardStep({ lesson, onComplete }: LessonStepProps) {
  return (
    <StepPlaceholder
      step="reward"
      title={lesson.title}
      onComplete={onComplete}
    />
  );
}
