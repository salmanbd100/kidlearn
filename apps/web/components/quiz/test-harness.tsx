"use client";

import type { Locale } from "@kidlearn/types";
import type { ReactNode } from "react";
import type { QuestionFeedback } from "./use-question-feedback";
import { useQuestionFeedback } from "./use-question-feedback";

/**
 * Test-only. Gives a question component the *real* feedback channel, in a real
 * render tree, without the engine around it.
 *
 * The lock that makes a double-tap harmless is state inside `useQuestionFeedback`
 * — a stubbed channel would prove only that the component calls a function, so
 * the format tests drive the genuine one and advance its timers themselves.
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
