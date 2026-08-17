import type { LessonDetailResponse, LessonStep } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const WORLD_ID = "world_jungle";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const content = vi.hoisted(() => ({ getLesson: vi.fn() }));
const progress = vi.hoisted(() => ({
  getLessonProgress: vi.fn(),
  reportStep: vi.fn(),
  sendSessionEvent: vi.fn(),
  // `RewardStep` calls this on mount (file 23), so it is reached whenever the
  // player walks as far as the celebration.
  completeLesson: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/content-api", () => content);
vi.mock("@/lib/progress-api", () => progress);

const { LessonPlayer } = await import("./LessonPlayer");

function lessonDetail(): LessonDetailResponse {
  return {
    id: LESSON_ID,
    slug: "letter-a-sounds",
    title: "The Letter A",
    worldId: WORLD_ID,
    world: {
      id: WORLD_ID,
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: null,
    },
    locale: "en",
    introScript: "Hello! Today we learn the letter A.",
    introAudioUrl: null,
    videoUrl: null,
    videoPosterUrl: null,
    assetFallbacks: {
      introAudioUrl: false,
      videoUrl: false,
      videoPosterUrl: false,
    },
    activity: null,
    quiz: null,
    progress: null,
  };
}

function renderPlayer() {
  return render(
    <Providers locale="en">
      <LessonPlayer lessonId={LESSON_ID} />
    </Providers>,
  );
}

/**
 * Which step is on screen right now.
 *
 * `section[data-step]`, not `[data-step]`: the container's progress dots each name a
 * step too, and matching one of those would report `intro` forever.
 */
function currentStep(): string | null {
  return (
    document.querySelector("section[data-step]")?.getAttribute("data-step") ??
    null
  );
}

/**
 * What each step calls its way onward.
 *
 * The placeholders all said "Next"; the real steps say what they mean, and files
 * 18–23 will keep changing these words. Looked up per step rather than asserted,
 * because none of the tests below are about a step's copy — they are about the
 * flow that runs when a step reports itself complete, whatever it was labelled.
 */
const ADVANCE_LABEL: Record<string, RegExp> = {
  intro: /Let's go!/,
  video: /Done — next!/,
  // This lesson has no activity, so file 18's engine never runs — the step shows
  // the same friendly way onward it gives a child whose activity failed to parse.
  activity: /Let's go on!/,
  // Nor a quiz, and file 21's step says the same thing for the same reason.
  quiz: /Let's go on!/,
  // File 23's celebration. It appears once the completion call has answered.
  reward: /Done!/,
};

/** Taps the step's own advance control, i.e. the step reporting itself complete. */
function completeStep() {
  const step = currentStep() ?? "";
  fireEvent.click(
    screen.getByRole("button", { name: ADVANCE_LABEL[step] ?? "Next" }),
  );
}

/**
 * Taps through all five steps to the finish screen.
 *
 * Driven by which step is on screen rather than by a fixed count of writes: the
 * reward step reports itself through a different call from the other four (file
 * 23), so counting `reportStep` would stall on the last one.
 */
async function walkTheLesson() {
  for (const step of ["intro", "video", "activity", "quiz"] as const) {
    completeStep();
    await waitFor(() => expect(currentStep()).not.toBe(step));
  }
  // The celebration's button appears once the completion call has answered.
  await screen.findByRole("button", { name: ADVANCE_LABEL.reward });
  completeStep();
  await screen.findByRole("heading", { name: "All done!" });
}

function eventsOfType(type: string): unknown[] {
  return progress.sendSessionEvent.mock.calls
    .map(([event]) => event as { type: string })
    .filter((event) => event.type === type);
}

describe("LessonPlayer", () => {
  beforeEach(() => {
    resetI18nForTests();
    router.push.mockReset();
    router.replace.mockReset();
    content.getLesson.mockReset();
    for (const fn of Object.values(progress)) fn.mockReset();

    content.getLesson.mockResolvedValue({
      ok: true,
      data: { lesson: lessonDetail() },
    });
    progress.getLessonProgress.mockResolvedValue({
      ok: true,
      data: { progress: null },
    });
    progress.reportStep.mockResolvedValue({
      ok: true,
      data: {
        progress: {
          lessonId: LESSON_ID,
          currentStep: "intro",
          completedAt: null,
        },
      },
    });

    // `RewardStep` finishes the lesson itself (file 23). Its answer is what the
    // celebration renders; none of the tests here are about the numbers.
    progress.completeLesson.mockResolvedValue({
      ok: true,
      data: {
        starsEarned: 2,
        coinsEarned: 5,
        newBadges: [],
        newCharacters: [],
        streak: { current: 1, milestone: null },
        totals: { stars: 2, coins: 5 },
      },
    });
  });

  it("opens a fresh lesson on the intro step", async () => {
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe("intro"));
    // The lesson's *greeting*, not its title: file 17 replaced the placeholder,
    // and a child who cannot read has no use for "The Letter A" on screen.
    expect(
      screen.getByText("Hello! Today we learn the letter A."),
    ).toBeInTheDocument();
  });

  it("fetches the lesson and the saved position in parallel", async () => {
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe("intro"));
    expect(content.getLesson).toHaveBeenCalledWith(
      LESSON_ID,
      expect.anything(),
    );
    expect(progress.getLessonProgress).toHaveBeenCalledWith(LESSON_ID);
  });

  it("announces the start once, and only once", async () => {
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe("intro"));
    expect(eventsOfType("lesson_start")).toEqual([
      { type: "lesson_start", lessonId: LESSON_ID },
    ]);
  });

  it("walks all five steps and lands on the finish screen", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    for (const step of ["intro", "video", "activity", "quiz"] as const) {
      expect(currentStep()).toBe(step);
      completeStep();
      await waitFor(() => expect(currentStep()).not.toBe(step));
    }

    expect(currentStep()).toBe("reward");
    completeStep();

    expect(
      await screen.findByRole("heading", { name: "All done!" }),
    ).toBeInTheDocument();
  });

  it("posts one step report per step, and finishes through the completion endpoint", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    await walkTheLesson();

    // Four reports, not five: the reward step no longer reports itself here.
    // `RewardStep` calls the completion endpoint on mount instead, which does
    // that same report *and* writes the grants (file 23).
    expect(progress.reportStep.mock.calls.map(([, report]) => report)).toEqual([
      { step: "intro", completed: false },
      { step: "video", completed: false },
      { step: "activity", completed: false },
      { step: "quiz", completed: false },
    ]);
    for (const [lessonId] of progress.reportStep.mock.calls) {
      expect(lessonId).toBe(LESSON_ID);
    }
    expect(progress.completeLesson).toHaveBeenCalledTimes(1);
    expect(progress.completeLesson).toHaveBeenCalledWith(LESSON_ID);
  });

  it("emits lesson_start, five step_completes and lesson_complete (FR-LSN-07)", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    await walkTheLesson();

    expect(
      progress.sendSessionEvent.mock.calls.map(([event]) => event),
    ).toEqual([
      { type: "lesson_start", lessonId: LESSON_ID },
      // The two steps that play a server-resolved asset say which language they
      // got; the three that render their own localized payloads say nothing.
      {
        type: "step_complete",
        lessonId: LESSON_ID,
        step: "intro",
        fallback: false,
      },
      {
        type: "step_complete",
        lessonId: LESSON_ID,
        step: "video",
        fallback: false,
      },
      { type: "step_complete", lessonId: LESSON_ID, step: "activity" },
      { type: "step_complete", lessonId: LESSON_ID, step: "quiz" },
      { type: "step_complete", lessonId: LESSON_ID, step: "reward" },
      { type: "lesson_complete", lessonId: LESSON_ID },
    ]);
  });

  it("carries the locale fallback the finished step played (FR-I18N-01)", async () => {
    content.getLesson.mockResolvedValue({
      ok: true,
      data: {
        lesson: {
          ...lessonDetail(),
          assetFallbacks: {
            introAudioUrl: false,
            videoUrl: true,
            videoPosterUrl: false,
          },
        },
      },
    });
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    completeStep();
    await waitFor(() => expect(currentStep()).toBe("video"));
    completeStep();
    await waitFor(() => expect(currentStep()).toBe("activity"));

    expect(eventsOfType("step_complete")).toEqual([
      // The Bangla narration existed; only the film fell back to English.
      {
        type: "step_complete",
        lessonId: LESSON_ID,
        step: "intro",
        fallback: false,
      },
      {
        type: "step_complete",
        lessonId: LESSON_ID,
        step: "video",
        fallback: true,
      },
    ]);
  });

  it("reports nothing before the child has completed anything", async () => {
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe("intro"));
    // Opening a lesson is not progress in it.
    expect(progress.reportStep).not.toHaveBeenCalled();
  });
});

describe("resuming (FR-LSN-06)", () => {
  beforeEach(() => {
    resetI18nForTests();
    router.push.mockReset();
    content.getLesson.mockReset();
    for (const fn of Object.values(progress)) fn.mockReset();

    content.getLesson.mockResolvedValue({
      ok: true,
      data: { lesson: lessonDetail() },
    });
    progress.reportStep.mockResolvedValue({
      ok: true,
      data: {
        progress: {
          lessonId: LESSON_ID,
          currentStep: "video",
          completedAt: null,
        },
      },
    });

    // Reached by the case that resumes straight onto the celebration.
    progress.completeLesson.mockResolvedValue({
      ok: true,
      data: {
        starsEarned: 2,
        coinsEarned: 5,
        newBadges: [],
        newCharacters: [],
        streak: { current: 1, milestone: null },
        totals: { stars: 2, coins: 5 },
      },
    });
  });

  function withSavedProgress(
    currentSaved: LessonStep,
    completedAt: string | null = null,
  ) {
    progress.getLessonProgress.mockResolvedValue({
      ok: true,
      data: {
        progress: {
          lessonId: LESSON_ID,
          currentStep: currentSaved,
          completedAt,
        },
      },
    });
  }

  it.each([
    ["intro", "video"],
    ["video", "activity"],
    ["activity", "quiz"],
    ["quiz", "reward"],
  ] as const)("a lesson interrupted after %s reopens at %s", async (saved, expected) => {
    withSavedProgress(saved);
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe(expected));
  });

  it("does not report the step it resumed past as freshly completed", async () => {
    withSavedProgress("video");
    renderPlayer();

    await waitFor(() => expect(currentStep()).toBe("activity"));
    // The child watched the video in an earlier session. Reporting it again here
    // would be recording work that did not just happen.
    expect(progress.reportStep).not.toHaveBeenCalled();
  });

  it("reports the resumed step when the child finishes it", async () => {
    withSavedProgress("video");
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("activity"));

    completeStep();

    await waitFor(() =>
      expect(progress.reportStep).toHaveBeenCalledWith(LESSON_ID, {
        step: "activity",
        completed: false,
      }),
    );
  });

  it("replays a completed lesson from the intro", async () => {
    withSavedProgress("reward", "2026-08-01T10:00:00.000Z");
    renderPlayer();

    // A finished lesson has no step after `reward`, so it starts over — and the
    // server's `completedAt` is left exactly where it was.
    await waitFor(() => expect(currentStep()).toBe("intro"));
  });

  it("opens at the intro rather than refusing when the progress read fails", async () => {
    progress.getLessonProgress.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });
    renderPlayer();

    // Starting over is worse than resuming, and far better than a child being
    // refused a lesson they asked for.
    await waitFor(() => expect(currentStep()).toBe("intro"));
  });
});

describe("leaving (FR-LSN-06, Pillar A)", () => {
  beforeEach(() => {
    resetI18nForTests();
    router.push.mockReset();
    content.getLesson.mockReset();
    for (const fn of Object.values(progress)) fn.mockReset();

    content.getLesson.mockResolvedValue({
      ok: true,
      data: { lesson: lessonDetail() },
    });
    progress.getLessonProgress.mockResolvedValue({
      ok: true,
      data: { progress: null },
    });
    progress.reportStep.mockResolvedValue({
      ok: true,
      data: {
        progress: {
          lessonId: LESSON_ID,
          currentStep: "intro",
          completedAt: null,
        },
      },
    });

    // `RewardStep` finishes the lesson itself (file 23). Its answer is what the
    // celebration renders; none of the tests here are about the numbers.
    progress.completeLesson.mockResolvedValue({
      ok: true,
      data: {
        starsEarned: 2,
        coinsEarned: 5,
        newBadges: [],
        newCharacters: [],
        streak: { current: 1, milestone: null },
        totals: { stars: 2, coins: 5 },
      },
    });
  });

  it("always asks before leaving", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    fireEvent.click(screen.getByRole("button", { name: "Leave the lesson" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Stay loses nothing — the same step is still on screen", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));
    completeStep();
    await waitFor(() => expect(currentStep()).toBe("video"));

    fireEvent.click(screen.getByRole("button", { name: "Leave the lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stay" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(currentStep()).toBe("video");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Leave returns to the world screen", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));

    fireEvent.click(screen.getByRole("button", { name: "Leave the lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/world/${WORLD_ID}`),
    );
  });

  it("keeps the progress already saved — leaving writes nothing extra", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));
    completeStep();
    await waitFor(() => expect(progress.reportStep).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Leave the lesson" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());

    // The intro was reported when it finished, not on the way out — which is why a
    // tablet that dies mid-video still resumes correctly.
    expect(progress.reportStep).toHaveBeenCalledTimes(1);
  });

  it("goes back to the world from the finish screen", async () => {
    renderPlayer();
    await waitFor(() => expect(currentStep()).toBe("intro"));
    await walkTheLesson();

    fireEvent.click(
      await screen.findByRole("button", { name: "Back to the world" }),
    );

    expect(router.push).toHaveBeenCalledWith(`/world/${WORLD_ID}`);
  });
});

describe("a lesson that is not there", () => {
  beforeEach(() => {
    resetI18nForTests();
    content.getLesson.mockReset();
    for (const fn of Object.values(progress)) fn.mockReset();
    progress.getLessonProgress.mockResolvedValue({
      ok: true,
      data: { progress: null },
    });
  });

  it("says the door is closed on a 404, and records nothing", async () => {
    content.getLesson.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "no lesson", status: 404 },
    });
    renderPlayer();

    expect(
      await screen.findByText("That lesson is closed."),
    ).toBeInTheDocument();
    expect(progress.reportStep).not.toHaveBeenCalled();
    expect(progress.sendSessionEvent).not.toHaveBeenCalled();
  });

  it("offers to try again on a real failure", async () => {
    content.getLesson.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });
    renderPlayer();

    expect(
      await screen.findByText("Let's try that again."),
    ).toBeInTheDocument();
  });
});
