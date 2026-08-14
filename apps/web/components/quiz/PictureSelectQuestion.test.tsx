import type { PictureSelectQuestion as PictureSelectDefinition } from "@kidlearn/types";
import { validPictureSelect } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { PictureSelectQuestion } from "./PictureSelectQuestion";
import { FeedbackHarness } from "./test-harness";
import type { QuizAnswerValue } from "./types";
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

function renderQuestion(
  locale: "en" | "bn" = "en",
  definition: PictureSelectDefinition = validPictureSelect,
) {
  const onAttempt =
    vi.fn<(answer: QuizAnswerValue, isCorrect: boolean) => void>();
  const onCommit = vi.fn<(answer: QuizAnswerValue) => void>();

  render(
    <Providers locale={locale}>
      <FeedbackHarness locale={locale}>
        {(feedback) => (
          <PictureSelectQuestion
            definition={definition}
            locale={locale}
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

describe("PictureSelectQuestion", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every picture the payload carries (FR-QUIZ-04)", () => {
    renderQuestion();

    expect(screen.getByTestId("quiz-picture-select")).toBeInTheDocument();
    for (const { id } of validPictureSelect.options) {
      expect(option(id)).toBeInTheDocument();
    }
  });

  it("names a wordless picture by its alt text, in the child's language", () => {
    renderQuestion("bn");

    expect(screen.getByRole("img", { name: "একটি ত্রিভুজ" })).toBeInTheDocument();
  });

  // `alt` is optional on the schema, so this payload is one an author can
  // publish. A card left with no accessible name at all would be a button a
  // screen reader reads as "button" and voice control cannot address.
  it("still names a picture the payload never described", () => {
    renderQuestion("en", {
      ...validPictureSelect,
      options: validPictureSelect.options.map((option) => ({
        id: option.id,
        image: { kind: "image", url: option.image.url },
      })),
    });

    expect(
      screen.getByRole("button", { name: "Picture 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Picture 3" }),
    ).toBeInTheDocument();
  });

  it("sets a wrong picture aside and lets the child try again", () => {
    vi.useFakeTimers();
    const { onAttempt, onCommit } = renderQuestion();

    fireEvent.click(option("circle"));

    expect(onAttempt).toHaveBeenCalledWith("circle", false);
    expect(option("circle")).toHaveAttribute("data-state", "tried");
    expect(onCommit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(RETRY_HOLD_MS));
    fireEvent.click(option("triangle"));
    act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

    expect(onCommit).toHaveBeenCalledWith("triangle");
  });

  it("commits the right picture after the cheer, not before it", () => {
    vi.useFakeTimers();
    const { onAttempt, onCommit } = renderQuestion();

    fireEvent.click(option("triangle"));

    expect(onAttempt).toHaveBeenCalledWith("triangle", true);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));

    expect(onCommit).toHaveBeenCalledWith("triangle");
  });

  it("ignores taps landed during the cheer", () => {
    vi.useFakeTimers();
    const { onAttempt } = renderQuestion();

    fireEvent.click(option("triangle"));
    fireEvent.click(option("square"));

    expect(onAttempt).toHaveBeenCalledTimes(1);
  });
});
