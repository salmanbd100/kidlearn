import type { DragEndEvent } from "@dnd-kit/core";
import { validDragAnswer } from "@kidlearn/types";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { DragAnswerQuestion } from "./DragAnswerQuestion";
import type { QuizAnswerValue } from "./types";
import {
  BLANK_DROPPABLE_ID,
  splitAtBlank,
  useDragAnswer,
} from "./use-drag-answer";
import {
  CORRECT_HOLD_MS,
  RETRY_HOLD_MS,
  useQuestionFeedback,
} from "./use-question-feedback";

/**
 * jsdom cannot perform a drag — there is no layout, so no collision detection
 * and no sensor run. The answer rules are therefore driven through
 * `useDragAnswer` directly, which is the reason that hook exists; the render
 * tests below cover only what the markup is, not what dragging does to it.
 */

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

function dragEnd(optionId: string, overId: string | null): DragEndEvent {
  // A real `DragEndEvent` carries the whole sensor run — collisions, deltas, the
  // activator event, both measured rects. `handleDragEnd` reads two fields of
  // it, so the fixture supplies those; the cast is what stands in for a drag the
  // environment cannot produce, and narrowing is impossible by construction.
  return {
    active: {
      id: optionId,
      data: { current: undefined },
      rect: { current: {} },
    },
    over:
      overId === null
        ? null
        : {
            id: overId,
            rect: {},
            data: { current: undefined },
            disabled: false,
          },
  } as unknown as DragEndEvent;
}

/**
 * The hook under test, wired to the *real* feedback channel: the lock that
 * ignores a drop during the cheer lives inside it, and a stubbed channel would
 * prove only that the hook calls a function.
 */
function renderDragAnswer() {
  const onAttempt =
    vi.fn<(answer: QuizAnswerValue, isCorrect: boolean) => void>();
  const onCommit = vi.fn<(answer: QuizAnswerValue) => void>();

  const { result } = renderHook(() =>
    useDragAnswer({
      definition: validDragAnswer,
      feedback: useQuestionFeedback("en"),
      onAttempt,
      onCommit,
    }),
  );

  return { result, onAttempt, onCommit };
}

describe("splitAtBlank", () => {
  it("splits the sentence either side of its token", () => {
    expect(splitAtBlank("The sky is {blank}.")).toEqual({
      before: "The sky is ",
      after: ".",
    });
  });

  it("degrades to the whole sentence when a payload carries no token", () => {
    // The schema guarantees one token, but a payload is JSONB validated in a
    // different process — rendering `undefined` at a child is the worse failure.
    expect(splitAtBlank("The sky is blue.")).toEqual({
      before: "The sky is blue.",
      after: "",
    });
  });
});

describe("useDragAnswer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks the right option into the blank and commits after the cheer", () => {
    vi.useFakeTimers();
    const { result, onAttempt, onCommit } = renderDragAnswer();

    act(() =>
      result.current.handleDragEnd(dragEnd("blue", BLANK_DROPPABLE_ID)),
    );

    expect(result.current.lockedId).toBe("blue");
    expect(onAttempt).toHaveBeenCalledWith("blue", true);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

    expect(onCommit).toHaveBeenCalledWith("blue");
  });

  it("dims a wrong option and keeps the child on the question (§5.7)", () => {
    const { result, onAttempt, onCommit } = renderDragAnswer();

    act(() =>
      result.current.handleDragEnd(dragEnd("green", BLANK_DROPPABLE_ID)),
    );

    expect(result.current.lockedId).toBeUndefined();
    expect([...result.current.dimmedIds]).toEqual(["green"]);
    expect(onAttempt).toHaveBeenCalledWith("green", false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores an option already tried and set aside", () => {
    vi.useFakeTimers();
    const { result, onAttempt } = renderDragAnswer();

    act(() =>
      result.current.handleDragEnd(dragEnd("green", BLANK_DROPPABLE_ID)),
    );
    act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
    act(() =>
      result.current.handleDragEnd(dragEnd("green", BLANK_DROPPABLE_ID)),
    );

    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it("lets the child answer correctly after a wrong try", () => {
    vi.useFakeTimers();
    const { result, onAttempt, onCommit } = renderDragAnswer();

    act(() =>
      result.current.handleDragEnd(dragEnd("green", BLANK_DROPPABLE_ID)),
    );
    act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
    act(() =>
      result.current.handleDragEnd(dragEnd("blue", BLANK_DROPPABLE_ID)),
    );
    act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

    expect(onAttempt).toHaveBeenNthCalledWith(2, "blue", true);
    expect(onCommit).toHaveBeenCalledWith("blue");
  });

  it("does nothing at all when the card is let go over empty space", () => {
    const { result, onAttempt, onCommit } = renderDragAnswer();

    act(() => result.current.handleDragEnd(dragEnd("blue", null)));

    // The child has not answered yet, so there is nothing to encourage them
    // about — silence, not a retry.
    expect(result.current.lockedId).toBeUndefined();
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does nothing when the card is let go over something that is not the blank", () => {
    const { result, onAttempt } = renderDragAnswer();

    act(() => result.current.handleDragEnd(dragEnd("blue", "somewhere-else")));

    expect(onAttempt).not.toHaveBeenCalled();
  });

  it("ignores a second drop landing during the cheer", () => {
    vi.useFakeTimers();
    const { result, onAttempt, onCommit } = renderDragAnswer();

    act(() =>
      result.current.handleDragEnd(dragEnd("blue", BLANK_DROPPABLE_ID)),
    );
    act(() =>
      result.current.handleDragEnd(dragEnd("green", BLANK_DROPPABLE_ID)),
    );
    act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("DragAnswerQuestion", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  function renderQuestion(locale: "en" | "bn" = "en") {
    render(
      <Providers locale={locale}>
        <DragAnswerQuestion
          definition={validDragAnswer}
          locale={locale}
          feedback={{ isLocked: false, correct: vi.fn(), retry: vi.fn() }}
          onAttempt={vi.fn()}
          onCommit={vi.fn()}
        />
      </Providers>,
    );
  }

  it("renders the sentence around an empty blank (FR-QUIZ-03)", () => {
    renderQuestion();

    expect(screen.getByTestId("quiz-drag-answer")).toHaveTextContent(
      "The sky is",
    );
    expect(screen.getByTestId("quiz-drag-blank")).toHaveAttribute(
      "data-state",
      "empty",
    );
  });

  it("trays every option the payload carries", () => {
    renderQuestion();

    for (const { id } of validDragAnswer.options) {
      expect(screen.getByTestId(`quiz-drag-option-${id}`)).toBeInTheDocument();
    }
  });

  it("writes the sentence in the child's own language", () => {
    renderQuestion("bn");

    expect(screen.getByTestId("quiz-drag-answer")).toHaveTextContent("আকাশ");
    expect(screen.getByTestId("quiz-drag-option-blue")).toHaveTextContent(
      "নীল",
    );
  });

  it("gives nothing away before the child answers", () => {
    renderQuestion();

    for (const { id } of validDragAnswer.options) {
      expect(screen.getByTestId(`quiz-drag-option-${id}`)).toHaveAttribute(
        "data-state",
        "idle",
      );
    }
  });

  it("shows no error iconography anywhere on the question (FR-QUIZ-05)", () => {
    renderQuestion();

    expect(screen.queryByText("✗")).not.toBeInTheDocument();
    expect(screen.getByTestId("quiz-drag-answer").textContent).not.toMatch(
      /wrong|try again/i,
    );
  });
});
