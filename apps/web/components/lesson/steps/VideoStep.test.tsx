import type { LessonDetailResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { clearPreloadCache } from "@/lib/use-preload-next-step";
import { VideoStep } from "./VideoStep";

/**
 * jsdom implements no media playback at all: `play()` is undefined, `duration`
 * is `NaN`, and no `canplay` ever fires on its own. So `play`/`pause` are
 * spied and the element is driven by dispatching the events a real browser
 * would — which is the same thing the component listens to, so the state
 * machine under test is the real one.
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

const VIDEO_URL = "https://cdn.kidlearn.test/video/en/letter-a.mp4";
const POSTER_URL = "https://cdn.kidlearn.test/poster/en/letter-a.jpg";

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
      mascot: null,
    },
    locale: "en",
    introScript: "Hello!",
    introAudioUrl: null,
    videoUrl: VIDEO_URL,
    videoPosterUrl: POSTER_URL,
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

function renderVideo(overrides: Partial<LessonDetailResponse> = {}) {
  const onComplete = vi.fn();
  render(
    <Providers locale="en">
      <VideoStep lesson={lessonDetail(overrides)} onComplete={onComplete} />
    </Providers>,
  );
  return {
    onComplete,
    get element() {
      return videoElement();
    },
  };
}

/** The rendered media element. Throws rather than returning `null`, so a test
 * that lost it fails where it looked instead of three assertions later. */
function videoElement(): HTMLVideoElement {
  const element = document.querySelector("video");
  if (element === null) throw new Error("no video element rendered");
  return element;
}

/** Walks the element to the state a child would be in after playback starts. */
function startPlaying(element: HTMLVideoElement): void {
  fireEvent(element, new Event("canplay"));
  fireEvent(element, new Event("playing"));
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

describe("VideoStep", () => {
  beforeEach(() => {
    resetI18nForTests();
    clearPreloadCache();
    audio.stop.mockClear();
    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it("never exposes the browser's own controls (FR-LSN-02)", () => {
    const { element } = renderVideo();

    // The seek bar, the volume slider, the fullscreen button and the overflow
    // menu all arrive together with this one attribute.
    expect(element).not.toHaveAttribute("controls");
  });

  it("closes the escape hatches into browser chrome", () => {
    const { element } = renderVideo();

    expect(element).toHaveAttribute("playsinline");
    expect(element).toHaveAttribute("disablepictureinpicture");
    expect(element.getAttribute("controlsList")).toBe(
      "nodownload nofullscreen noremoteplayback",
    );
  });

  it("paints the poster immediately rather than a black rectangle", () => {
    const { element } = renderVideo();

    expect(element).toHaveAttribute("poster", POSTER_URL);
  });

  it("shows the loading skeleton until the video can play (NFR-PERF-02)", () => {
    const { element } = renderVideo();
    expect(screen.getByTestId("video-skeleton")).toBeInTheDocument();

    fireEvent(element, new Event("canplay"));

    expect(screen.queryByTestId("video-skeleton")).not.toBeInTheDocument();
  });

  it("attempts to play on arrival so the lesson keeps moving", () => {
    renderVideo();

    expect(playSpy).toHaveBeenCalled();
  });

  it("falls back to the poster and a play button when autoplay is blocked", async () => {
    playSpy.mockRejectedValue(new Error("NotAllowedError"));

    renderVideo();

    // Never a silent failure: the child is left with the one obvious thing to
    // tap, not a still frame that ignores them.
    expect(
      await screen.findByRole("button", { name: "Play" }),
    ).toBeInTheDocument();
  });

  it("silences the lesson narration when the film starts — one sound source", () => {
    const { element } = renderVideo();

    startPlaying(element);

    expect(audio.stop).toHaveBeenCalled();
  });

  it("pauses through the big toggle", () => {
    const { element } = renderVideo();
    startPlaying(element);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(pauseSpy).toHaveBeenCalled();
  });

  it("resumes from paused through the same toggle", () => {
    const { element } = renderVideo();
    startPlaying(element);
    fireEvent(element, new Event("pause"));
    playSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(playSpy).toHaveBeenCalled();
  });

  it("shows a buffering spinner rather than a frozen frame mid-stall", () => {
    const { element } = renderVideo();
    startPlaying(element);

    fireEvent(element, new Event("waiting"));

    expect(screen.getByTestId("video-buffering")).toBeInTheDocument();
  });

  it("reveals the advance button when the video ends, and does not advance by itself", () => {
    const { element, onComplete } = renderVideo();
    startPlaying(element);

    fireEvent(element, new Event("ended"));

    // Explicit tap: a child who looked away for the last ten seconds should find
    // the lesson where they left it, not two steps on.
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Done — next!/ }),
    ).toBeInTheDocument();
  });

  it("advances when the child taps done", () => {
    const { element, onComplete } = renderVideo();
    startPlaying(element);
    fireEvent(element, new Event("ended"));

    fireEvent.click(screen.getByRole("button", { name: /Done — next!/ }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps replay available after the end — re-watching is not a mistake", () => {
    const { element } = renderVideo();
    startPlaying(element);
    fireEvent(element, new Event("ended"));
    playSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Watch it again" }));

    expect(element.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
  });

  it("shows a friendly retry instead of a raw error", () => {
    const { element } = renderVideo();

    fireEvent(element, new Event("error"));

    expect(
      screen.getByText("That video didn't want to play."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeInTheDocument();
  });

  it("reloads the source when the child taps retry", () => {
    const loadSpy = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    const { element } = renderVideo();
    fireEvent(element, new Event("error"));

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(loadSpy).toHaveBeenCalled();
    // Back to the loading state, so a recovering video shows the skeleton again
    // rather than the error it just left.
    expect(screen.getByTestId("video-skeleton")).toBeInTheDocument();
    loadSpy.mockRestore();
  });

  it("offers the way onward when the lesson has no video at all", () => {
    const { onComplete } = renderVideo({ videoUrl: null });

    fireEvent.click(screen.getByRole("button", { name: /Done — next!/ }));

    // Missing content is a hole to walk past, not a screen a child is stuck on.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows how much is left without letting the child scrub (FR-LSN-02)", () => {
    const { element } = renderVideo();
    startPlaying(element);
    Object.defineProperty(element, "duration", { value: 120, writable: true });
    element.currentTime = 30;

    fireEvent(element, new Event("timeupdate"));

    expect(screen.getByTestId("video-progress")).toHaveStyle({
      transform: "scaleX(0.25)",
    });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("ignores a duration the browser has not worked out yet", () => {
    const { element } = renderVideo();
    startPlaying(element);
    element.currentTime = 5;

    // jsdom reports `NaN` here, as a real browser does before metadata loads.
    fireEvent(element, new Event("timeupdate"));

    expect(screen.getByTestId("video-progress")).toHaveStyle({
      transform: "scaleX(0)",
    });
  });

  it("identifies itself as the video step for the player's tests", () => {
    renderVideo();

    expect(document.querySelector("section[data-step]")).toHaveAttribute(
      "data-step",
      "video",
    );
  });
});
