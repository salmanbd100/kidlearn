import type { LessonDetailResponse } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayOptions } from "@/components/AudioProvider";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { IntroStep } from "./IntroStep";

/**
 * The audio channel is the thing under test here as much as the markup is: the
 * intro's whole job is to speak on arrival, and jsdom has no playback. So the
 * hook is replaced with a recorder that also lets a test decide *when* the clip
 * ends, which is what drives the advance cue.
 */
const audio = vi.hoisted(() => {
  const play = vi.fn(
    async (
      _url: string,
      _opts?: { interrupt?: boolean; onFinished?: () => void },
    ) => {},
  );
  return {
    play,
    stop: vi.fn(),
    isPlaying: false,
    muted: false,
    setMuted: vi.fn(),
  };
});

vi.mock("@/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/AudioProvider")
  >("@/components/AudioProvider");
  return { ...actual, useAudio: () => audio };
});

const AUDIO_URL = "https://cdn.kidlearn.test/audio/en/letter-a-intro.mp3";
const MASCOT_URL = "https://cdn.kidlearn.test/mascot/jungle.png";

function lessonDetail(
  overrides: Partial<LessonDetailResponse> = {},
): LessonDetailResponse {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "letter-a-sounds",
    title: "The Letter A",
    worldId: "world_jungle",
    world: {
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: { id: "asset_mascot", url: MASCOT_URL, kind: "image" },
    },
    locale: "en",
    introScript: "Hello! Today we learn the letter A.",
    introAudioUrl: AUDIO_URL,
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
    ...overrides,
  };
}

function renderIntro(overrides: Partial<LessonDetailResponse> = {}) {
  const onComplete = vi.fn();
  render(
    <Providers locale="en">
      <IntroStep lesson={lessonDetail(overrides)} onComplete={onComplete} />
    </Providers>,
  );
  return onComplete;
}

/**
 * Fires the `onFinished` callback handed to the most recent `play()` call — what
 * the real provider does when a clip reaches its end.
 */
function finishNarration(): void {
  const lastCall = audio.play.mock.calls.at(-1);
  // The mock's argument tuple is typed from the stub above, not from the real
  // hook, so the options object arrives wider than `PlayOptions`.
  const options = lastCall?.[1] as PlayOptions | undefined;
  act(() => options?.onFinished?.());
}

describe("IntroStep", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
    audio.stop.mockClear();
  });

  it("speaks the intro on arrival without waiting for a tap (FR-LSN-01)", () => {
    renderIntro();

    expect(audio.play).toHaveBeenCalledWith(
      AUDIO_URL,
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("interrupts whatever was playing rather than talking over it", () => {
    renderIntro();

    const [, options] = audio.play.mock.calls[0];
    expect(options?.interrupt).toBe(true);
  });

  it("shows the script as reinforcement for a reader", () => {
    renderIntro();

    expect(
      screen.getByText("Hello! Today we learn the letter A."),
    ).toBeInTheDocument();
  });

  it("restarts the narration when the replay button is tapped", () => {
    renderIntro();
    audio.play.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Say it again" }));

    expect(audio.play).toHaveBeenCalledWith(
      AUDIO_URL,
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("advances when the child taps Let's go!", () => {
    const onComplete = renderIntro();

    fireEvent.click(screen.getByRole("button", { name: /Let's go!/ }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("never traps the child behind the narration — the advance works while it plays", () => {
    const onComplete = renderIntro();

    // Deliberately not calling `finishNarration()` first.
    const advance = screen.getByRole("button", { name: /Let's go!/ });
    expect(advance).not.toBeDisabled();
    fireEvent.click(advance);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("pulses the advance button once the narration has finished", () => {
    renderIntro();
    const advance = screen.getByRole("button", { name: /Let's go!/ });
    expect(advance.className).not.toContain("animate-pulse");

    fireEvent.click(screen.getByRole("button", { name: "Say it again" }));
    finishNarration();

    expect(
      screen.getByRole("button", { name: /Let's go!/ }).className,
    ).toContain("animate-pulse");
  });

  it("shows the advance cue immediately when the lesson has no narration yet", () => {
    renderIntro({ introAudioUrl: null });

    // Silence must not read as "still loading" — a lesson awaiting the voice
    // pipeline (file 36) still has to be walkable today.
    expect(
      screen.getByRole("button", { name: /Let's go!/ }).className,
    ).toContain("animate-pulse");
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("offers no replay button when there is nothing to replay", () => {
    renderIntro({ introAudioUrl: null });

    expect(
      screen.queryByRole("button", { name: "Say it again" }),
    ).not.toBeInTheDocument();
  });

  it("renders the world's mascot as the visual anchor", () => {
    renderIntro();

    expect(screen.getByTestId("intro-mascot")).toBeInTheDocument();
  });

  it("survives a world with no mascot asset", () => {
    const lesson = lessonDetail();
    renderIntro({ world: { ...lesson.world, mascot: null } });

    expect(screen.queryByTestId("intro-mascot")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Let's go!/ }),
    ).toBeInTheDocument();
  });

  it("identifies itself as the intro step for the player's tests", () => {
    renderIntro();

    expect(document.querySelector("section[data-step]")).toHaveAttribute(
      "data-step",
      "intro",
    );
  });
});
