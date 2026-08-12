"use client";

/**
 * The quiz (FR-LSN-04, FR-QUIZ-01..08).
 *
 * Placeholder. Files 21–22 replace the body with the question engine over
 * `lesson.quiz.questions`, and file 22 is where the score and the per-question
 * `QuizResponse` rows are reported — from inside this step, not through the
 * player, so scoring stays server-authoritative.
 */
import type { LessonStepProps } from "./lesson-step-props";
import { StepPlaceholder } from "./StepPlaceholder";

export function QuizStep({ lesson, onComplete }: LessonStepProps) {
  return (
    <StepPlaceholder step="quiz" title={lesson.title} onComplete={onComplete} />
  );
}
