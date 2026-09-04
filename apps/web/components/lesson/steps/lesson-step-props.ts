import type { LessonDetailResponse } from "@kidlearn/types";

/** The contract every one of the five steps is built against. */
export interface LessonStepProps {
  lesson: LessonDetailResponse;
  onComplete: () => void;
  /** Administrator preview: render everything, record nothing. */
  isPreview?: boolean;
}
