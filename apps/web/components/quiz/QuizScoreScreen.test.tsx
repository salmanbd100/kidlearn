import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { QuizScoreScreen } from "./QuizScoreScreen";
import type { QuizAnswerRecord } from "./types";

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

function record(questionId: string, isCorrect: boolean): QuizAnswerRecord {
  return {
    questionId,
    answer: "apple",
    isCorrect,
    attempts: isCorrect ? 1 : 2,
  };
}

function renderScreen(records: readonly QuizAnswerRecord[]) {
  const onDone = vi.fn();

  render(
    <Providers locale="en">
      <QuizScoreScreen records={records} onDone={onDone} />
    </Providers>,
  );

  return { onDone };
}

const TWO_OF_THREE = [
  record("q1", true),
  record("q2", false),
  record("q3", true),
];

describe("QuizScoreScreen", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  it("fills one star per first-try-correct answer (FR-QUIZ-06)", () => {
    renderScreen(TWO_OF_THREE);

    expect(screen.getAllByTestId("quiz-score-star")).toHaveLength(2);
  });

  it("gives the rest a sparkle, never an empty slot", () => {
    renderScreen(TWO_OF_THREE);

    // An unfilled outline is a mark against a four-year-old whichever shape it
    // is drawn in — the questions they needed a second go at still shine.
    expect(screen.getAllByTestId("quiz-score-sparkle")).toHaveLength(1);
  });

  it("shows one mark per question and no more", () => {
    renderScreen(TWO_OF_THREE);

    expect(screen.getByTestId("quiz-score-stars").children).toHaveLength(3);
  });

  it("celebrates just as loudly when nothing was right first time", () => {
    renderScreen([record("q1", false), record("q2", false)]);

    expect(screen.getByTestId("quiz-score")).toHaveTextContent("You did it!");
    expect(screen.getAllByTestId("quiz-score-sparkle")).toHaveLength(2);
    expect(screen.queryAllByTestId("quiz-score-star")).toHaveLength(0);
  });

  it("plays praise however it went", () => {
    renderScreen([record("q1", false)]);

    expect(audio.play).toHaveBeenCalledWith(
      expect.stringMatching(/^\/audio\/feedback\/cheer-\d\.mp3$/),
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("shows no number, percentage or grade anywhere", () => {
    renderScreen(TWO_OF_THREE);

    const text = screen.getByTestId("quiz-score").textContent ?? "";
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/%|score|out of/i);
  });

  it("advances the lesson when the child taps the button", () => {
    const { onDone } = renderScreen(TWO_OF_THREE);

    fireEvent.click(screen.getByRole("button", { name: "Yay!" }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
