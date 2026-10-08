import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

const audio = vi.hoisted(() => ({
  play: vi.fn(async (_url: string, _options?: { interrupt?: boolean }) => {}),
}));

vi.mock("@/shared/components/AudioProvider", () => ({
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

  // `interrupt: true` on every call is the single-channel guarantee when a child taps faster than a clip plays.
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
