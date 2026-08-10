"use client";

/**
 * The interactive activity (FR-LSN-03).
 *
 * Placeholder. Files 18–20 replace the body with the generic activity engine,
 * which renders whatever `lesson.activity.definition` describes — drag-drop,
 * trace, match or puzzle. `activity` is nullable, and a lesson without one is a
 * shape the flow already handles.
 */
import type { LessonStepProps } from "./lesson-step-props";
import { StepPlaceholder } from "./StepPlaceholder";

export function ActivityStep({ lesson, onComplete }: LessonStepProps) {
  return (
    <StepPlaceholder
      step="activity"
      title={lesson.title}
      onComplete={onComplete}
    />
  );
}
