import type { LessonDetailResponse } from "@kidlearn/types";
import type { PendingWrites } from "../pending-writes";

/** The contract every one of the five steps is built against. */
export interface LessonStepProps {
  lesson: LessonDetailResponse;
  onComplete: () => void;
  /** Administrator preview: render everything, record nothing. */
  isPreview?: boolean;
  /** Shared across the steps of one lesson; `LessonPlayer` always supplies it. */
  pendingWrites?: PendingWrites;
}
