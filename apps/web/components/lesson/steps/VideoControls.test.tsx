import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { VideoControls, type VideoState } from "./VideoControls";

function renderControls(state: VideoState) {
  const onPlayPause = vi.fn();
  const onReplay = vi.fn();
  render(
    <Providers locale="en">
      <VideoControls
        state={state}
        onPlayPause={onPlayPause}
        onReplay={onReplay}
      />
    </Providers>,
  );
  return { onPlayPause, onReplay };
}

describe("VideoControls", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it.each([
    "ready",
    "paused",
  ] as const)("offers play while the video is %s", (state) => {
    renderControls(state);

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it.each([
    "playing",
    "buffering",
  ] as const)("offers pause while the video is %s", (state) => {
    renderControls(state);

    // Buffering counts as playing for the toggle: the child asked for the film
    // to run and it still is — a pause icon mid-stall says the wrong thing.
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("toggles through the callback rather than touching the element itself", () => {
    const { onPlayPause } = renderControls("playing");

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it.each([
    "loading",
    "ended",
    "error",
  ] as const)("offers no play/pause while the video is %s", (state) => {
    renderControls(state);

    expect(screen.queryByTestId("video-play-pause")).not.toBeInTheDocument();
  });

  it("offers replay once the video has ended", () => {
    const { onReplay } = renderControls("ended");

    fireEvent.click(screen.getByRole("button", { name: "Watch it again" }));

    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it.each([
    "loading",
    "ready",
    "playing",
    "paused",
    "buffering",
  ] as const)("hides replay while the video is %s — there is nothing to start over", (state) => {
    renderControls(state);

    expect(screen.queryByTestId("video-replay")).not.toBeInTheDocument();
  });

  it("never renders a seek bar or a volume slider (FR-LSN-02)", () => {
    renderControls("playing");

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("keeps every control at the kid touch-target size", () => {
    renderControls("ended");

    // `size-20` is 80px — above the 64px floor, because these are aimed at while
    // the rest of the screen is a moving picture (design.md §7).
    for (const testId of ["video-play-pause", "video-replay"]) {
      const control = screen.queryByTestId(testId);
      if (control !== null) expect(control.className).toContain("size-20");
    }
  });

  it("labels both controls for assistive tech rather than leaving bare icons", () => {
    renderControls("ended");

    expect(
      screen.getByRole("button", { name: "Watch it again" }),
    ).toBeInTheDocument();
  });
});
