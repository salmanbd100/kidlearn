import type { LessonDetailResponse } from "@kidlearn/types";
import { validMcq } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { CORRECT_HOLD_MS } from "@/components/quiz/use-question-feedback";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The one thing this file owns that the engine does not: what happens after the
 * last question. The submission is stubbed at the module boundary, which is
 * where it is a network call — everything below is about the child never
 * waiting on it.
 */

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const QUIZ_ID = "44444444-4444-4444-8444-444444444444";

const progress = vi.hoisted(() => ({ submitQuizResponses: vi.fn() }));
vi.mock("@/lib/progress-api", () => progress);

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

const { QuizStep } = await import("./QuizStep");

function lessonWithQuiz(
  quiz: LessonDetailResponse["quiz"],
): LessonDetailResponse {
  return {
    id: LESSON_ID,
    slug: "letter-a-sounds",
    title: "The Letter A",
    worldId: "world_jungle",
    world: {
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: null,
    },
    locale: "en",
    introScript: "Hello!",
    introAudioUrl: null,
    videoUrl: null,
    videoPosterUrl: null,
    assetFallbacks: {
      introAudioUrl: false,
      videoUrl: false,
      videoPosterUrl: false,
    },
    activity: null,
    quiz,
    progress: null,
  };
}

const ONE_QUESTION = {
  id: QUIZ_ID,
  title: "Colours",
  questions: [
    {
      id: "q_1",
      format: "mcq" as const,
      schemaVersion: 1,
      sortOrder: 0,
      definition: validMcq,
    },
  ],
};

function renderStep(quiz: LessonDetailResponse["quiz"] = ONE_QUESTION) {
  const onComplete = vi.fn();

  render(
    <Providers locale="en">
      <QuizStep lesson={lessonWithQuiz(quiz)} onComplete={onComplete} />
    </Providers>,
  );

  return { onComplete };
}

/** Answers the single question correctly and waits out the cheer. */
function answerTheQuiz() {
  fireEvent.click(screen.getByTestId("quiz-option-apple"));
  act(() => vi.advanceTimersByTime(CORRECT_HOLD_MS));
}

describe("QuizStep", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
    progress.submitQuizResponses.mockReset();
    progress.submitQuizResponses.mockResolvedValue({
      ok: true,
      data: {
        lessonId: LESSON_ID,
        score: 100,
        correctCount: 1,
        totalQuestions: 1,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts the answers once the last question is done (FR-QUIZ-08)", () => {
    vi.useFakeTimers();
    renderStep();

    answerTheQuiz();

    expect(progress.submitQuizResponses).toHaveBeenCalledWith(QUIZ_ID, [
      { questionId: "q_1", answer: "apple", isCorrect: true, attempts: 1 },
    ]);
  });

  it("shows the score screen without waiting for the server (FR-QUIZ-06)", () => {
    vi.useFakeTimers();
    // A promise that never settles is the network that never answers.
    progress.submitQuizResponses.mockReturnValue(new Promise(() => {}));
    renderStep();

    answerTheQuiz();

    expect(screen.getByTestId("quiz-score")).toBeInTheDocument();
  });

  it("celebrates and advances even when the submission fails", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    progress.submitQuizResponses.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "no" },
    });
    const { onComplete } = renderStep();

    answerTheQuiz();
    expect(screen.getByTestId("quiz-score")).toBeInTheDocument();

    // The rejection is a microtask, and fake timers do not flush those.
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Yay!" }));

    // A lost row is a gap in a report an adult reads later. A child stranded on
    // a spinner is the lesson over.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("quiz responses not recorded"),
    );
    warn.mockRestore();
  });

  it("advances from the score screen rather than straight from the quiz", () => {
    vi.useFakeTimers();
    const { onComplete } = renderStep();

    answerTheQuiz();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yay!" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("moves on quietly when the lesson has no quiz", () => {
    const { onComplete } = renderStep(null);

    fireEvent.click(screen.getByRole("button", { name: "Let's go on!" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(progress.submitQuizResponses).not.toHaveBeenCalled();
  });

  it("skips the celebration when no question could be asked at all", () => {
    const { onComplete } = renderStep({
      id: QUIZ_ID,
      title: "Colours",
      questions: [],
    });

    // Congratulating a child for a quiz they never saw is worse than moving on.
    expect(screen.queryByTestId("quiz-score")).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(progress.submitQuizResponses).not.toHaveBeenCalled();
  });
});
