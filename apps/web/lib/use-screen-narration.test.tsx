import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The audio channel is stubbed rather than driven: jsdom has no media pipeline,
 * so `HTMLMediaElement.play` is unimplemented and every assertion would be about
 * the stub anyway. `AudioProvider` is stubbed alongside `useAudio` because
 * `Providers` mounts it.
 */
const audio = vi.hoisted(() => ({
  play: vi.fn(async (_url: string, _options?: { interrupt?: boolean }) => {}),
}));

vi.mock("@/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { screenNarrationUrl, useScreenNarration } = await import(
  "./use-screen-narration"
);

function Screen() {
  useScreenNarration("home");
  return <p>home</p>;
}

describe("useScreenNarration", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  // `interrupt: true` on every call is the single-channel guarantee: it stops two
  // voice-overs overlapping when a three-year-old taps through screens faster
  // than a clip plays.
  it("speaks the screen's prompt once on arrival", () => {
    render(
      <Providers locale="en">
        <Screen />
      </Providers>,
    );

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith("/audio/ui/home.en.mp3", {
      interrupt: true,
    });
  });

  it("speaks it in the child's language", () => {
    render(
      <Providers locale="bn">
        <Screen />
      </Providers>,
    );

    expect(audio.play).toHaveBeenCalledWith("/audio/ui/home.bn.mp3", {
      interrupt: true,
    });
  });

  it("resolves assets by screen key and locale", () => {
    expect(screenNarrationUrl("selectProfile", "bn")).toBe(
      "/audio/ui/selectProfile.bn.mp3",
    );
  });
});
