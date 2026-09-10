"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { QuizAnswerRecord, QuizAnswerValue } from "./types";

/**
 * Where the child is in the quiz, and what they have answered so far
 * (FR-QUIZ-07).
 */

export interface QuizSessionState {
  /** Fixed for the session's lifetime — the count the engine started with. */
  questionCount: number;
  currentIndex: number;
  /** Taps on the question currently on screen. */
  attempts: number;
  /** Latched on the first attempt and left alone after it — see `isCorrect`. */
  isFirstAttemptCorrect: boolean;
  records: readonly QuizAnswerRecord[];
}

export type QuizSessionEvent =
  | { type: "ATTEMPT"; isCorrect: boolean }
  | { type: "COMMIT"; questionId: string; answer: QuizAnswerValue };

export function initialQuizSession(questionCount: number): QuizSessionState {
  return {
    questionCount,
    currentIndex: 0,
    attempts: 0,
    isFirstAttemptCorrect: false,
    records: [],
  };
}

/** A quiz with no playable questions is finished before it starts. */
export function isQuizSessionFinished(state: QuizSessionState): boolean {
  return state.currentIndex >= state.questionCount;
}

export function quizSessionReducer(
  state: QuizSessionState,
  event: QuizSessionEvent,
): QuizSessionState {
  if (isQuizSessionFinished(state)) return state;

  switch (event.type) {
    case "ATTEMPT":
      return {
        ...state,
        attempts: state.attempts + 1,
        isFirstAttemptCorrect:
          state.attempts === 0 ? event.isCorrect : state.isFirstAttemptCorrect,
      };

    case "COMMIT":
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        attempts: 0,
        isFirstAttemptCorrect: false,
        records: [
          ...state.records,
          {
            questionId: event.questionId,
            answer: event.answer,
            isCorrect: state.isFirstAttemptCorrect,
            // A commit is always preceded by the attempt that produced it, so
            // this floor never binds in the app. It is here because `attempts:
            // 0` on a question a child answered is a number file 22 would put
            // in a parent's report.
            attempts: Math.max(state.attempts, 1),
          },
        ],
      };
  }
}

export interface QuizSession {
  currentIndex: number;
  attempts: number;
  records: readonly QuizAnswerRecord[];
  isFinished: boolean;
  attempt: (isCorrect: boolean) => void;
  commit: (questionId: string, answer: QuizAnswerValue) => void;
}

/**
 * `questionCount` is read once, at mount. The engine parses its payloads into a
 * memoised list before rendering this, so the count cannot change under a
 * session that is already running — and a quiz that grew mid-answer would
 * renumber the fruit strip under the child's finger.
 */
export function useQuizSession(
  questionCount: number,
  onFinish: (records: readonly QuizAnswerRecord[]) => void,
): QuizSession {
  const [state, dispatch] = useReducer(
    quizSessionReducer,
    questionCount,
    initialQuizSession,
  );

  const attempt = useCallback(
    (isCorrect: boolean) => dispatch({ type: "ATTEMPT", isCorrect }),
    [],
  );

  const commit = useCallback(
    (questionId: string, answer: QuizAnswerValue) =>
      dispatch({ type: "COMMIT", questionId, answer }),
    [],
  );

  const isFinished = isQuizSessionFinished(state);

  // Once, whatever re-renders follow — the step this reports to navigates away,
  // and reporting twice would advance the lesson two steps.
  const hasFinished = useRef(false);
  useEffect(() => {
    if (!isFinished || hasFinished.current) return;
    hasFinished.current = true;
    onFinish(state.records);
  }, [isFinished, state.records, onFinish]);

  return useMemo(
    () => ({
      currentIndex: state.currentIndex,
      attempts: state.attempts,
      records: state.records,
      isFinished,
      attempt,
      commit,
    }),
    [state, isFinished, attempt, commit],
  );
}
