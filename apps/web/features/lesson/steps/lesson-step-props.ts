import type { LessonDetailResponse } from "@kidlearn/types";
import type { Locale } from "@/shared/lib/locale";
import type { PendingWrites } from "../pending-writes";

export interface LessonStepProps {
  lesson: LessonDetailResponse;
  onComplete: () => void;
  /** The interface's locale, except in an admin preview where it is the language under review. */
  locale: Locale;
  isPreview?: boolean;
  pendingWrites?: PendingWrites;
}
