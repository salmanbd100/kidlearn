import type { StorySummaryResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The two-tap rule, which is the whole reason this component exists: a pre-reader
 * has to be able to hear what a cover says without opening it (FR-STORY-01).
 */

const audio = vi.hoisted(() => ({ play: vi.fn(async () => {}) }));

vi.mock("@/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { StoryGrid } = await import("./StoryGrid");

function story(
  overrides: Partial<StorySummaryResponse> = {},
): StorySummaryResponse {
  return {
    id: "story_1",
    slug: "the-sharing-monkey",
    title: "The Sharing Monkey",
    titleAudioUrl: "/dev/story-sharing-monkey.title.en.mp3",
    locale: "en",
    world: {
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: null,
    },
    coverImageUrl: null,
    pageCount: 5,
    completed: false,
    ...overrides,
  };
}

const DOT = story({
  id: "story_2",
  slug: "dot-counts-the-fish",
  title: "Dot Counts the Fish",
  titleAudioUrl: "/dev/story-dot-counts-the-fish.title.en.mp3",
});

function renderGrid(stories: StorySummaryResponse[]) {
  const onOpen = vi.fn();
  render(
    <Providers locale="en">
      <StoryGrid stories={stories} onOpen={onOpen} />
    </Providers>,
  );
  return { onOpen };
}

const cover = (title: string) =>
  screen.getByRole("button", { name: `Read ${title}` });

describe("StoryGrid", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  it("reads a title aloud on the first tap without opening the story", () => {
    const { onOpen } = renderGrid([story()]);

    fireEvent.click(cover("The Sharing Monkey"));

    expect(audio.play).toHaveBeenCalledWith(
      "/dev/story-sharing-monkey.title.en.mp3",
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(cover("The Sharing Monkey")).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the story on a second tap of the same cover", () => {
    const { onOpen } = renderGrid([story()]);

    fireEvent.click(cover("The Sharing Monkey"));
    fireEvent.click(cover("The Sharing Monkey"));

    expect(onOpen).toHaveBeenCalledWith("story_1");
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("moves the selection and reads the new title when a different cover is tapped", () => {
    const { onOpen } = renderGrid([story(), DOT]);

    fireEvent.click(cover("The Sharing Monkey"));
    fireEvent.click(cover("Dot Counts the Fish"));

    // Not an open: the child is still browsing, and the second tap landed
    // somewhere else.
    expect(onOpen).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenLastCalledWith(
      "/dev/story-dot-counts-the-fish.title.en.mp3",
    );
    expect(cover("The Sharing Monkey")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(cover("Dot Counts the Fish")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("needs a third tap to open after the selection moved", () => {
    const { onOpen } = renderGrid([story(), DOT]);

    fireEvent.click(cover("The Sharing Monkey"));
    fireEvent.click(cover("Dot Counts the Fish"));
    fireEvent.click(cover("Dot Counts the Fish"));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("story_2");
  });

  it("opens on the first tap when no title recording exists yet", () => {
    // `titleAudioUrl` is `null` until the voice pipeline (file 36) fills it.
    // Requiring a confirming tap for something the child was never told would be
    // a door that needs two pushes for no reason.
    const { onOpen } = renderGrid([story({ titleAudioUrl: null })]);

    fireEvent.click(cover("The Sharing Monkey"));

    expect(audio.play).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith("story_1");
  });

  it("renders one cover per story", () => {
    renderGrid([story(), DOT]);

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
