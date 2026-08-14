import type { QuizQuestionDefinition } from "@kidlearn/types";
import type { QuizAnswerValue } from "./types";

/**
 * What counts as a right answer, for every quiz format that has one
 * (FR-QUIZ-01, FR-QUIZ-04).
 *
 * The same split as `activities/evaluate.ts`: the question components decide
 * what an answer *looks* like, this decides what an answer *means*. No React, no
 * DOM — so the rule a child is marked against is testable as a table rather than
 * through taps.
 */
export function evaluateAnswer(
  question: QuizQuestionDefinition,
  answer: QuizAnswerValue,
): boolean {
  switch (question.type) {
    case "mcq":
    case "picture_select":
      return answer === question.correctOptionId;
    case "drag_answer":
    case "match_pair":
      // Unreachable from the app: the registry renders neither format yet, and
      // the engine drops a question it cannot render before a child ever sees
      // it. Throwing rather than returning `false` — silently marking every
      // answer wrong would trap a child on a question with no way out, which is
      // worse than a crash an engineer can see.
      throw new Error(`evaluateAnswer: ${question.type} arrives with file 22`);
  }
}
