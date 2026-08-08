import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioProvider } from "@/components/AudioProvider";
import { IconTile } from "./IconTile";

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

describe("IconTile", () => {
  beforeEach(() => {
    playedSrcs.length = 0;
    vi.stubGlobal("Audio", MockAudio);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a square tile no smaller than the kid touch target", () => {
    renderWithAudio(<IconTile label="Numbers" />);

    const tile = screen.getByRole("button", { name: "Numbers" });
    expect(tile).toHaveClass("aspect-square", "min-h-24", "min-w-24");
  });

  it("renders the label at the 20px kid minimum", () => {
    renderWithAudio(<IconTile label="Numbers" />);

    expect(screen.getByText("Numbers")).toHaveClass("text-lg");
  });

  it("treats the illustration as decorative so the label carries the meaning", () => {
    renderWithAudio(<IconTile label="Numbers" imageSrc="/img/numbers.webp" />);

    const tile = screen.getByRole("button");
    expect(tile).toHaveAccessibleName("Numbers");
    // An empty alt keeps the picture out of the accessibility tree entirely.
    expect(tile.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("speaks its label and runs the handler on tap", async () => {
    const onPress = vi.fn();
    renderWithAudio(
      <IconTile
        label="Numbers"
        audioSrc="/audio/worlds/numbers.en.mp3"
        onPress={onPress}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(playedSrcs).toEqual(["/audio/worlds/numbers.en.mp3"]),
    );
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("announces the selected state rather than showing it in colour alone", () => {
    const { rerender } = renderWithAudio(
      <IconTile label="Numbers" isSelected />,
    );

    const tile = screen.getByRole("button");
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(tile).toHaveClass("border-primary");

    rerender(
      <AudioProvider>
        <IconTile label="Numbers" />
      </AudioProvider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a visible focus ring for keyboard users", () => {
    renderWithAudio(<IconTile label="Numbers" />);

    expect(screen.getByRole("button")).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    );
  });
});
