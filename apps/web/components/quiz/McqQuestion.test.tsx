import type { McqQuestion as McqDefinition } from "@kidlearn/types";
import { validMcq } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { McqQuestion } from "./McqQuestion";
import { FeedbackHarness } from "./test-harness";
import type { QuizAnswerValue } from "./types";
import { CORRECT_HOLD_MS, RETRY_HOLD_MS } from "./use-question-feedback";

/**
 * The tap rules are driven through the real feedback channel rather than a spy:
 * the lock that ignores a double-tap lives in it, and a stubbed channel would
 * prove only that the component calls a function.
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

function renderQuestion(definition: McqDefinition = validMcq) {
  const onAttempt =
    vi.fn<(answer: QuizAnswerValue, isCorrect: boolean) => void>();
  const onCommit = vi.fn<(answer: QuizAnswerValue) => void>();

  render(
    <Providers locale="en">
      <FeedbackHarness locale="en">
        {(feedback) => (
          <McqQuestion
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

function option(id: string): HTMLElement {
  return screen.getByTestId(`quiz-option-${id}`);
}

describe("McqQuestion", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every option the payload carries (FR-QUIZ-01)", () => {
    renderQuestion();

    expect(screen.getByTestId("quiz-mcq")).toBeInTheDocument();
    for (const { id } of validMcq.options) {
      expect(option(id)).toBeInTheDocument();
    }
  });

  it("labels each option in the child's language", () => {
    renderQuestion();

    expect(option("apple")).toHaveTextContent("Apple");
  });

  // An mcq option needs text *or* image, and an image needs no alt — so a card
  // with nothing to name it is a payload an author can publish.
  it("names an option that has neither words nor alt text", () => {
    renderQuestion({
      ...validMcq,
      options: validMcq.options.map((item) => ({
        id: item.id,
        image: {
          kind: "image",
          url: `https://cdn.kidlearn.test/${item.id}.png`,
        },
      })),
    });

    expect(option("apple")).toHaveAccessibleName("Picture 1");
  });

  describe("a wrong tap (§5.7)", () => {
    it("reports the attempt and stays on the question", () => {
      const { onAttempt, onCommit } = renderQuestion();

      fireEvent.click(option("leaf"));

      expect(onAttempt).toHaveBeenCalledWith("leaf", false);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("sets that option aside and leaves the others tappable", () => {
      renderQuestion();

      fireEvent.click(option("leaf"));

      expect(option("leaf")).toHaveAttribute("data-state", "tried");
      expect(option("leaf")).toHaveAttribute("aria-disabled", "true");
      expect(option("apple")).toHaveAttribute("data-state", "idle");
    });

    it("plays encouragement rather than a failure sound", () => {
      renderQuestion();

      fireEvent.click(option("leaf"));

      expect(audio.play).toHaveBeenCalledWith(
        expect.stringMatching(/^\/audio\/feedback\/retry-en-\d\.mp3$/),
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("ignores a second tap on an option already set aside", () => {
      vi.useFakeTimers();
      const { onAttempt } = renderQuestion();

      fireEvent.click(option("leaf"));
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      fireEvent.click(option("leaf"));

      expect(onAttempt).toHaveBeenCalledTimes(1);
    });

    it("lets the child answer correctly afterwards", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      fireEvent.click(option("leaf"));
      act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
      fireEvent.click(option("apple"));
      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      expect(onAttempt).toHaveBeenNthCalledWith(2, "apple", true);
      expect(onCommit).toHaveBeenCalledWith("apple");
    });
  });

  describe("the right tap", () => {
    it("reports the attempt at once and commits after the cheer", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      fireEvent.click(option("apple"));

      expect(onAttempt).toHaveBeenCalledWith("apple", true);
      expect(onCommit).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      expect(onCommit).toHaveBeenCalledWith("apple");
    });

    it("marks the card with a tick as well as a glow", () => {
      renderQuestion();

      fireEvent.click(option("apple"));

      expect(option("apple")).toHaveAttribute("data-state", "correct");
      expect(option("apple")).toHaveTextContent("That's it!");
    });

    it("cheers", () => {
      renderQuestion();

      fireEvent.click(option("apple"));

      expect(audio.play).toHaveBeenCalledWith(
        expect.stringMatching(/^\/audio\/feedback\/cheer-\d\.mp3$/),
        expect.objectContaining({ interrupt: true }),
      );
    });

    it("ignores the taps a drumming child lands during the cheer", () => {
      vi.useFakeTimers();
      const { onAttempt, onCommit } = renderQuestion();

      fireEvent.click(option("apple"));
      fireEvent.click(option("apple"));
      fireEvent.click(option("leaf"));

      expect(onAttempt).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });
});
