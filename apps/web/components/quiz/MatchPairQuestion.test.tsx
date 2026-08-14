import type { MatchPairQuestion as MatchPairDefinition } from "@kidlearn/types";
import { validMatchPair } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { MatchPairQuestion } from "./MatchPairQuestion";
import { FeedbackHarness } from "./test-harness";
import type { QuizAnswerValue } from "./types";
import { CORRECT_HOLD_MS, RETRY_HOLD_MS } from "./use-question-feedback";

/**
 * Driven through the real feedback channel rather than a spy, like the MCQ
 * suite: the lock that ignores a tap during the closing cheer lives inside
 * `useQuestionFeedback`, and a stubbed channel would prove only that the
 * component calls a function.
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

const BOTH_PAIRS = {
  pairs: [
    { leftId: "dog", rightId: "woof" },
    { leftId: "cat", rightId: "meow" },
  ],
};

function renderQuestion(definition: MatchPairDefinition = validMatchPair) {
  const onAttempt =
    vi.fn<(answer: QuizAnswerValue, isCorrect: boolean) => void>();
  const onCommit = vi.fn<(answer: QuizAnswerValue) => void>();

  render(
    <Providers locale="en">
      <FeedbackHarness locale="en">
        {(feedback) => (
          <MatchPairQuestion
            definition={definition}
            locale="en"
            feedback={feedback}
            onAttempt={onAttempt}
            onCommit={onCommit}
          />
        )}
      </FeedbackHarness>
    </Providers>,
  );

  return { onAttempt, onCommit };
}

function card(id: string): HTMLElement {
  return screen.getByTestId(`quiz-pair-card-${id}`);
}

function tap(id: string) {
  fireEvent.click(card(id));
}

/** Matches both pairs cleanly, in the order a child would. */
function matchEverything() {
  tap("dog");
  tap("woof");
  tap("cat");
  tap("meow");
}

describe("MatchPairQuestion", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every card in both columns (FR-QUIZ-02)", () => {
    renderQuestion();

    expect(screen.getByTestId("quiz-match-pair")).toBeInTheDocument();
    for (const id of ["dog", "cat", "woof", "meow"]) {
      expect(card(id)).toBeInTheDocument();
    }
  });

  it("labels each card in the child's language", () => {
    renderQuestion();

    expect(card("dog")).toHaveTextContent("Dog");
    expect(card("woof")).toHaveTextContent("Woof");
  });

  it("marks the first tap as picked without answering anything", () => {
    const { onAttempt } = renderQuestion();

    tap("dog");

    expect(card("dog")).toHaveAttribute("data-state", "selected");
    expect(onAttempt).not.toHaveBeenCalled();
  });

  describe("a wrong pair (§5.7)", () => {
    it("reports one failed attempt and leaves both cards on the board", () => {
      const { onAttempt, onCommit } = renderQuestion();

      tap("dog");
      tap("meow");

      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onAttempt).toHaveBeenCalledWith(
        { pairs: [{ leftId: "dog", rightId: "meow" }] },
        false,
      );
      expect(onCommit).not.toHaveBeenCalled();
      expect(card("dog")).toHaveAttribute("data-state", "idle");
      expect(card("meow")).toHaveAttribute("data-state", "idle");
    });

    it("clears the selection so the next tap starts a fresh pair", () => {
      renderQuestion();

      tap("dog");
      tap("meow");

      expect(card("dog")).toHaveAttribute("data-state", "idle");
    });

    it("plays encouragement rather than a failure sound", () => {
      renderQuestion();

      tap("dog");
      tap("meow");

      expect(audio.play).toHaveBeenCalledWith(
        expect.stringMatching(/^\/audio\/feedback\/retry-en-\d\.mp3$/),
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("lets the child finish afterwards, at the cost of one attempt", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      tap("dog");
      tap("meow");
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      matchEverything();
      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      // One wrong pair then a finish: two attempts, the first of which was not
      // correct — which is what makes this record score as "did not know it".
      expect(onAttempt).toHaveBeenCalledTimes(2);
      expect(onAttempt).toHaveBeenNthCalledWith(2, BOTH_PAIRS, true);
      expect(onCommit).toHaveBeenCalledWith(BOTH_PAIRS);
    });

    it("never runs out of tries", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        tap("dog");
        tap("meow");
        act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      }

      expect(onAttempt).toHaveBeenCalledTimes(5);
      expect(onCommit).not.toHaveBeenCalled();
      expect(card("dog")).toHaveAttribute("data-state", "idle");
    });
  });

  describe("a right pair", () => {
    it("locks both cards and stays on the question", () => {
      const { onAttempt, onCommit } = renderQuestion();

      tap("dog");
      tap("woof");

      expect(card("dog")).toHaveAttribute("data-state", "matched");
      expect(card("woof")).toHaveAttribute("data-state", "matched");
      // A pair matched mid-question is working, not an attempt: counting it
      // would make a four-pair question cost four attempts to answer perfectly.
      expect(onAttempt).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("confirms with a cheer without freezing the board", () => {
      const { onAttempt } = renderQuestion();

      tap("dog");
      tap("woof");

      expect(audio.play).toHaveBeenCalledWith(
        expect.stringMatching(/^\/audio\/feedback\/cheer-\d\.mp3$/),
        expect.objectContaining({ interrupt: true }),
      );

      // No hold between pairs — the next pair is answerable immediately.
      tap("cat");
      tap("meow");
      expect(onAttempt).toHaveBeenCalledWith(BOTH_PAIRS, true);
    });

    it("does nothing when a matched card is tapped again", () => {
      const { onAttempt } = renderQuestion();

      tap("dog");
      tap("woof");
      tap("dog");

      expect(card("dog")).toHaveAttribute("data-state", "matched");
      expect(onAttempt).not.toHaveBeenCalled();
    });
  });

  describe("the last pair", () => {
    it("reports a clean run as a single correct attempt", () => {
      vi.useFakeTimers();
      const { onAttempt } = renderQuestion();

      matchEverything();

      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onAttempt).toHaveBeenCalledWith(BOTH_PAIRS, true);
    });

    it("commits after the cheer, not during it", () => {
      vi.useFakeTimers();
      const { onCommit } = renderQuestion();

      matchEverything();
      expect(onCommit).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      expect(onCommit).toHaveBeenCalledWith(BOTH_PAIRS);
    });

    it("ignores the taps a drumming child lands during the closing cheer", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      matchEverything();
      tap("dog");
      tap("meow");

      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });

  it("shows no error iconography anywhere on the board (FR-QUIZ-05)", () => {
    renderQuestion();

    tap("dog");
    tap("meow");

    expect(screen.queryByText("✗")).not.toBeInTheDocument();
    expect(screen.getByTestId("quiz-match-pair").textContent).not.toMatch(
      /wrong|try again/i,
    );
  });
});
