import type { LessonListItemResponse } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

const audio = vi.hoisted(() => ({ play: vi.fn(async () => {}) }));

vi.mock("@/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { LessonTile } = await import("./LessonTile");

function lesson(
  overrides: Partial<LessonListItemResponse> = {},
): LessonListItemResponse {
  return {
    id: "lesson_1",
    slug: "letter-a-sounds",
    title: "The Letter A",
    worldId: "world_jungle",
    sortOrder: 1,
    thumbnailUrl: null,
    durationEstimateSec: null,
    nameAudioUrl: null,
    progress: null,
    ...overrides,
  };
}

function renderTile(item: LessonListItemResponse) {
  const onOpen = vi.fn();
  render(
    <Providers locale="en">
      <LessonTile lesson={item} onOpen={onOpen} />
    </Providers>,
  );
  return { onOpen };
}

describe("LessonTile", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  it("speaks the lesson's name and opens it on the same tap", () => {
    const { onOpen } = renderTile(
      lesson({ nameAudioUrl: "https://cdn.kidlearn.test/audio/letter-a.mp3" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /The Letter A/ }));

    // Both, on one tap: the channel outlives this tree, so the name carries into
    // the lesson that is already loading rather than being cut off by it.
    expect(audio.play).toHaveBeenCalledWith(
      "https://cdn.kidlearn.test/audio/letter-a.mp3",
    );
    expect(onOpen).toHaveBeenCalledWith("lesson_1");
  });

  it("still opens the lesson when no voice-over exists yet", () => {
    // `nameAudioUrl` is a reserved `null` until the voice pipeline (file 36)
    // fills it, so silence must never mean a dead tile.
    const { onOpen } = renderTile(lesson());

    fireEvent.click(screen.getByRole("button", { name: /The Letter A/ }));

    expect(audio.play).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith("lesson_1");
  });

  it("always shows the title, so meaning never rests on the picture", () => {
    renderTile(lesson());

    expect(screen.getByText("The Letter A")).toBeInTheDocument();
  });
});
