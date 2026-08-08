import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioProvider } from "@/components/AudioProvider";
import { BigButton } from "./BigButton";

const playedSrcs: string[] = [];

class MockAudio {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  currentTime = 0;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor(src: string) {
    playedSrcs.push(src);
  }
}

function renderWithAudio(ui: ReactNode) {
  return render(<AudioProvider>{ui}</AudioProvider>);
}

describe("BigButton", () => {
  beforeEach(() => {
    playedSrcs.length = 0;
    vi.stubGlobal("Audio", MockAudio);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("meets the 64px kid touch target and the pill radius by default", () => {
    renderWithAudio(<BigButton>Let's go!</BigButton>);

    const button = screen.getByRole("button", { name: "Let's go!" });
    expect(button).toHaveClass("min-h-16", "min-w-16", "rounded-pill");
    // 20px floor for kid text (design.md §3.2).
    expect(button).toHaveClass("text-lg");
  });

  it("becomes an 80px full-width bar at size lg", () => {
    renderWithAudio(<BigButton size="lg">Play</BigButton>);

    expect(screen.getByRole("button")).toHaveClass("min-h-20", "w-full");
  });

  it("keeps a visible focus ring for keyboard users", () => {
    renderWithAudio(<BigButton>Next</BigButton>);

    const button = screen.getByRole("button");
    expect(button).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    );

    button.focus();
    expect(button).toHaveFocus();
  });

  it("speaks its label and runs the handler on tap", async () => {
    const onPress = vi.fn();
    renderWithAudio(
      <BigButton audioSrc="/audio/ui/lets-go.en.mp3" onPress={onPress}>
        Let's go!
      </BigButton>,
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(playedSrcs).toEqual(["/audio/ui/lets-go.en.mp3"]),
    );
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("stays silent when no audio cue is given", async () => {
    const onPress = vi.fn();
    renderWithAudio(<BigButton onPress={onPress}>Play</BigButton>);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onPress).toHaveBeenCalledOnce());
    expect(playedSrcs).toEqual([]);
  });

  it("does nothing when disabled", () => {
    const onPress = vi.fn();
    renderWithAudio(
      <BigButton isDisabled audioSrc="/audio/ui/play.en.mp3" onPress={onPress}>
        Play
      </BigButton>,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onPress).not.toHaveBeenCalled();
    expect(playedSrcs).toEqual([]);
  });

  it("carries the kid theme's primary tone through to the shared primitive", () => {
    renderWithAudio(<BigButton variant="success">Correct!</BigButton>);

    expect(screen.getByRole("button")).toHaveClass("bg-success");
  });
});
