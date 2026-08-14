import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QuizSessionEvent, QuizSessionState } from "./use-quiz-session";
import {
  initialQuizSession,
  quizSessionReducer,
  useQuizSession,
} from "./use-quiz-session";

function run(
  state: QuizSessionState,
  ...events: QuizSessionEvent[]
): QuizSessionState {
  return events.reduce(quizSessionReducer, state);
}

const rightFirstTime: QuizSessionEvent[] = [
  { type: "ATTEMPT", isCorrect: true },
  { type: "COMMIT", questionId: "q1", answer: "apple" },
];

describe("quizSessionReducer", () => {
  it("starts on the first question with nothing answered", () => {
    const state = initialQuizSession(3);

    expect(state.currentIndex).toBe(0);
    expect(state.attempts).toBe(0);
    expect(state.records).toEqual([]);
  });

  it("counts every tap on the question on screen", () => {
    const state = run(
      initialQuizSession(2),
      { type: "ATTEMPT", isCorrect: false },
      { type: "ATTEMPT", isCorrect: false },
    );

    expect(state.attempts).toBe(2);
  });

  it("records a first-time-right answer as correct", () => {
    const state = run(initialQuizSession(2), ...rightFirstTime);

    expect(state.records).toEqual([
      { questionId: "q1", answer: "apple", isCorrect: true, attempts: 1 },
    ]);
  });

  it("records a wrong-then-right answer as incorrect, with both attempts", () => {
    const state = run(
      initialQuizSession(2),
      { type: "ATTEMPT", isCorrect: false },
      { type: "ATTEMPT", isCorrect: true },
      { type: "COMMIT", questionId: "q1", answer: "apple" },
    );

    expect(state.records).toEqual([
      { questionId: "q1", answer: "apple", isCorrect: false, attempts: 2 },
    ]);
  });

  it("keeps the first attempt's verdict however many follow it", () => {
    const state = run(
      initialQuizSession(2),
      { type: "ATTEMPT", isCorrect: true },
      { type: "ATTEMPT", isCorrect: false },
      { type: "ATTEMPT", isCorrect: true },
      { type: "COMMIT", questionId: "q1", answer: "apple" },
    );

    expect(state.records[0]?.isCorrect).toBe(true);
    expect(state.records[0]?.attempts).toBe(3);
  });

  it("moves to the next question on commit and starts its count fresh", () => {
    const state = run(
      initialQuizSession(2),
      { type: "ATTEMPT", isCorrect: false },
      { type: "ATTEMPT", isCorrect: true },
      { type: "COMMIT", questionId: "q1", answer: "apple" },
    );

    expect(state.currentIndex).toBe(1);
    expect(state.attempts).toBe(0);
    expect(state.isFirstAttemptCorrect).toBe(false);
  });

  it("keeps the answers in the order they were given", () => {
    const state = run(
      initialQuizSession(2),
      ...rightFirstTime,
      { type: "ATTEMPT", isCorrect: false },
      { type: "ATTEMPT", isCorrect: true },
      { type: "COMMIT", questionId: "q2", answer: "triangle" },
    );

    expect(state.records).toEqual([
      { questionId: "q1", answer: "apple", isCorrect: true, attempts: 1 },
      { questionId: "q2", answer: "triangle", isCorrect: false, attempts: 2 },
    ]);
  });

  it("is finished once the last question is committed", () => {
    const state = run(initialQuizSession(1), ...rightFirstTime);

    expect(state.currentIndex).toBe(1);
  });

  it("ignores taps that arrive after the last commit", () => {
    const finished = run(initialQuizSession(1), ...rightFirstTime);

    expect(
      quizSessionReducer(finished, { type: "ATTEMPT", isCorrect: true }),
    ).toBe(finished);
    expect(
      quizSessionReducer(finished, {
        type: "COMMIT",
        questionId: "q2",
        answer: "leaf",
      }),
    ).toBe(finished);
  });

  it("records at least one attempt for a commit that arrived without one", () => {
    const state = run(initialQuizSession(1), {
      type: "COMMIT",
      questionId: "q1",
      answer: "apple",
    });

    expect(state.records[0]?.attempts).toBe(1);
  });
});

describe("useQuizSession", () => {
  it("hands the finished records over after the last question", () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() => useQuizSession(2, onFinish));

    act(() => {
      result.current.attempt(true);
      result.current.commit("q1", "apple");
    });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      result.current.attempt(false);
      result.current.attempt(true);
      result.current.commit("q2", "triangle");
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith([
      { questionId: "q1", answer: "apple", isCorrect: true, attempts: 1 },
      { questionId: "q2", answer: "triangle", isCorrect: false, attempts: 2 },
    ]);
  });

  it("finishes immediately, with nothing, when there is nothing to ask", () => {
    const onFinish = vi.fn();
    renderHook(() => useQuizSession(0, onFinish));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith([]);
  });

  it("reports the finish once, however often it re-renders", () => {
    const onFinish = vi.fn();
    const { result, rerender } = renderHook(() => useQuizSession(1, onFinish));

    act(() => {
      result.current.attempt(true);
      result.current.commit("q1", "apple");
    });
    rerender();
    act(() => result.current.attempt(true));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
