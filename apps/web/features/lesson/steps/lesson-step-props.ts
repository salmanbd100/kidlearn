import type { LessonDetailResponse } from "@kidlearn/types";
import type { Locale } from "@/shared/lib/locale";
import type { PendingWrites } from "../pending-writes";

/** The contract every one of the five steps is built against. */
export interface LessonStepProps {
  lesson: LessonDetailResponse;
  onComplete: () => void;
  /**
   * Which language the content inside the payloads plays in. The interface's
   * own, except in an administrator preview, where it is the language under
   * review — which need not be the reviewer's.
   */
  locale: Locale;
  /** Administrator preview: render everything, record nothing. */
  isPreview?: boolean;
  /** Shared across the steps of one lesson; `LessonPlayer` always supplies it. */
  pendingWrites?: PendingWrites;
}
