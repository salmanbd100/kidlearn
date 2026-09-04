"use client";

import type { Locale } from "@kidlearn/types";
import type { ReactNode } from "react";
import type { QuestionFeedback } from "./use-question-feedback";
import { useQuestionFeedback } from "./use-question-feedback";

/**
 * Test-only. Gives a question component the *real* feedback channel, in a real
 * render tree, without the engine around it.
 */
export function FeedbackHarness({
  locale,
  children,
}: {
  locale: Locale;
  children: (feedback: QuestionFeedback) => ReactNode;
}) {
  return children(useQuestionFeedback(locale));
}
