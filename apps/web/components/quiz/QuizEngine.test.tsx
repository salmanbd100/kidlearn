import {
  invalidMcqBadCorrectId,
  invalidQuizUnknownType,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { QuizEngine } from "./QuizEngine";
import type { QuizAnswerRecord } from "./types";
import { CORRECT_HOLD_MS, RETRY_HOLD_MS } from "./use-question-feedback";

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  stop: vi.fn(),
  isPlaying: false,
  muted: false,
  setMuted: vi.fn(),
}));

vi.mock("@/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/AudioProvider")
  >("@/components/AudioProvider");
  return { ...actual, useAudio: () => audio };
});

function renderEngine(
  questions: readonly { id: string; definition: unknown }[],
  locale: "en" | "bn" = "en",
) {
  const onFinish = vi.fn<(records: readonly QuizAnswerRecord[]) => void>();

  render(
    <Providers locale={locale}>
      <QuizEngine
        quizId="quiz_1"
        questions={questions}
        locale={locale}
        onFinish={onFinish}
      />
    </Providers>,
  );

  return onFinish;
}

const twoQuestions = [
  { id: "q1", definition: validMcq },
  { id: "q2", definition: validPictureSelect },
];

function tap(optionId: string) {
  fireEvent.click(screen.getByTestId(`quiz-option-${optionId}`));
}

/** The feedback hold between the right answer and the next question. */
function settle() {
  act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));
}

describe("QuizEngine", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parse and dispatch (FR-QUIZ-07)", () => {
    it("asks one question at a time, in the order it was given them", () => {
      vi.useFakeTimers();
      renderEngine(twoQuestions);

      expect(screen.getByTestId("quiz-mcq")).toBeInTheDocument();
      expect(
        screen.queryByTestId("quiz-picture-select"),
      ).not.toBeInTheDocument();

      tap("apple");
      settle();

      expect(screen.getByTestId("quiz-picture-select")).toBeInTheDocument();
      expect(screen.queryByTestId("quiz-mcq")).not.toBeInTheDocument();
    });

    it("skips a malformed question rather than trapping the child", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      renderEngine([
        { id: "broken", definition: invalidMcqBadCorrectId },
        { id: "q1", definition: validMcq },
      ]);

      expect(screen.getByTestId("quiz-mcq")).toBeInTheDocument();
      expect(screen.getByTestId("quiz-progress-fruit").children).toHaveLength(
        1,
      );
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it.each([
      ["mcq", validMcq, "quiz-mcq"],
      ["picture_select", validPictureSelect, "quiz-picture-select"],
      ["match_pair", validMatchPair, "quiz-match-pair"],
      ["drag_answer", validDragAnswer, "quiz-drag-answer"],
    ])("renders a %s question from its payload", (_type, definition, testId) => {
      renderEngine([{ id: "q1", definition }]);

      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    it("finishes with nothing when no question can be asked", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const onFinish = renderEngine([
        { id: "broken", definition: invalidQuizUnknownType },
      ]);

      expect(onFinish).toHaveBeenCalledWith([]);
      expect(screen.queryByTestId("quiz-engine")).not.toBeInTheDocument();
      error.mockRestore();
    });
  });

  describe("question audio (FR-QUIZ-05)", () => {
    it("speaks the question on arrival without waiting for a tap", () => {
      renderEngine(twoQuestions);

      expect(audio.play).toHaveBeenCalledWith(
        validMcq.promptAudio.en.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("speaks the child's own locale, not English", () => {
      renderEngine(twoQuestions, "bn");

      expect(audio.play).toHaveBeenCalledWith(
        validMcq.promptAudio.bn.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("speaks again on every question, not just the first", () => {
      vi.useFakeTimers();
      renderEngine(twoQuestions);

      tap("apple");
      settle();

      expect(audio.play).toHaveBeenCalledWith(
        validPictureSelect.promptAudio.en.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("replays the question from a control the child can hit", () => {
      renderEngine(twoQuestions);
      audio.play.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Say it again" }));

      expect(audio.play).toHaveBeenCalledWith(
        validMcq.promptAudio.en.url,
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("shows the question's words alongside the voice", () => {
      renderEngine(twoQuestions);

      expect(screen.getByText(validMcq.prompt.en)).toBeInTheDocument();
    });
  });

  describe("the records it hands over", () => {
    it("reports one record per question, first-time-right marked correct", () => {
      vi.useFakeTimers();
      const onFinish = renderEngine(twoQuestions);

      tap("apple");
      settle();
      tap("triangle");
      settle();

      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith([
        { questionId: "q1", answer: "apple", isCorrect: true, attempts: 1 },
        {
          questionId: "q2",
          answer: "triangle",
          isCorrect: true,
          attempts: 1,
        },
      ]);
    });

    it("marks a wrong-then-right question incorrect, with both attempts", () => {
      vi.useFakeTimers();
      const onFinish = renderEngine([{ id: "q1", definition: validMcq }]);

      tap("leaf");
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      tap("apple");
      settle();

      expect(onFinish).toHaveBeenCalledWith([
        { questionId: "q1", answer: "apple", isCorrect: false, attempts: 2 },
      ]);
    });

    it("stays on the question until it is answered correctly", () => {
      vi.useFakeTimers();
      const onFinish = renderEngine([{ id: "q1", definition: validMcq }]);

      tap("leaf");
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      tap("sky");
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));

      expect(screen.getByTestId("quiz-mcq")).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
    });
  });

  describe("the progress strip", () => {
    it("shows one fruit per question and moves it along", () => {
      vi.useFakeTimers();
      renderEngine(twoQuestions);

      const fruit = () =>
        Array.from(screen.getByTestId("quiz-progress-fruit").children).map(
          (item) => item.getAttribute("data-state"),
        );

      expect(fruit()).toEqual(["current", "todo"]);

      tap("apple");
      settle();

      expect(fruit()).toEqual(["done", "current"]);
    });
  });
});
