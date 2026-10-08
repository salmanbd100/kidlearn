"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { QuizAnswerRecord, QuizAnswerValue } from "./types";

export interface QuizSessionState {
  questionCount: number;
  currentIndex: number;
  attempts: number;
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
            isFirstAttemptCorrect: state.isFirstAttemptCorrect,
            // A commit always follows its attempt, so this floor never binds in the app; it stops
            // `attempts: 0` reaching a parent's report.
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
 * `questionCount` is read once at mount: a quiz that grew mid-answer would renumber the fruit strip
 * under the child's finger.
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

  // Once only: reporting twice would advance the lesson two steps.
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
