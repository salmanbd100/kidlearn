import type { StoryDetailResponse } from "@kidlearn/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * What the reducer cannot prove on its own: that the narration follows the page,
 * that a tap beats the auto-advance timer, and that a story the child reads three
 * times is paid for once (FR-STORY-02, FR-STORY-06..07).
 */

const STORY_ID = "55555555-5555-4555-8555-555555555555";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const content = vi.hoisted(() => ({ getStory: vi.fn() }));
const progress = vi.hoisted(() => ({ completeStory: vi.fn() }));
/** Captures each clip's `onFinished` so a test can end the narration itself. */
const audio = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  finishCurrentClip: () => {},
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/content-api", () => content);
vi.mock("@/lib/progress-api", () => progress);
vi.mock("@/components/AudioProvider", () => ({
  useAudio: () => audio,
  AudioProvider: ({ children }: { children: ReactNode }) => children,
}));

const { StoryReader } = await import("./StoryReader");

function story(
  overrides: Partial<StoryDetailResponse> = {},
): StoryDetailResponse {
  return {
    id: STORY_ID,
    slug: "the-sharing-monkey",
    title: "The Sharing Monkey",
    moral: "Sharing makes playing better",
    moralAudioUrl: "/dev/sharing-monkey-moral.en.mp3",
    world: {
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: null,
    },
    coverImageUrl: null,
    locale: "en",
    pages: [1, 2].map((pageNumber) => ({
      pageNumber,
      illustrationUrl: null,
      text: `English page ${pageNumber}.`,
      narrationUrl: `/dev/sharing-monkey-${pageNumber}.en.mp3`,
      narrationTimings: null,
    })),
    completed: false,
    ...overrides,
  };
}

async function renderReader() {
  render(
    <Providers locale="en">
      <StoryReader storyId={STORY_ID} />
    </Providers>,
  );
  await screen.findByTestId("story-reader");
  // The surface can be found in the render before its effects have run, and the
  // narration is one of those effects — flush them before asserting on playback.
  await act(async () => {});
}

function currentPage(): string | null {
  return (
    screen.queryByTestId("story-page")?.getAttribute("data-page-number") ?? null
  );
}

/** Ends the narration and runs out the hold before the page turns itself. */
async function finishNarrationAndWait() {
  await act(async () => {
    audio.finishCurrentClip();
    await vi.advanceTimersByTimeAsync(1500);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetI18nForTests();
  router.push.mockReset();
  audio.stop.mockReset();
  audio.play.mockReset().mockImplementation(async (_url, opts) => {
    audio.finishCurrentClip = () => opts?.onFinished?.();
  });
  content.getStory.mockReset().mockResolvedValue({
    ok: true,
    data: { story: story() },
  });
  progress.completeStory.mockReset().mockResolvedValue({
    ok: true,
    data: { alreadyCompleted: false, granted: { stars: 1, coins: 5 } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading a story", () => {
  it("opens on page one and plays its narration without a tap", async () => {
    await renderReader();

    expect(currentPage()).toBe("1");
    expect(screen.getByTestId("narrated-text")).toHaveTextContent(
      "English page 1.",
    );
    // A pre-reader has no other way in — the narration is the page (Pillar A).
    expect(audio.play).toHaveBeenCalledWith(
      "/dev/sharing-monkey-1.en.mp3",
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("turns the page on the next arrow and plays the new page", async () => {
    await renderReader();

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => expect(currentPage()).toBe("2"));
    expect(audio.play).toHaveBeenLastCalledWith(
      "/dev/sharing-monkey-2.en.mp3",
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("turns the page on a leftward swipe and back on a rightward one", async () => {
    await renderReader();
    const surface = screen.getByTestId("story-reader");

    fireEvent.pointerDown(surface, { clientX: 300 });
    fireEvent.pointerUp(surface, { clientX: 200 });
    await waitFor(() => expect(currentPage()).toBe("2"));

    fireEvent.pointerDown(surface, { clientX: 200 });
    fireEvent.pointerUp(surface, { clientX: 300 });
    await waitFor(() => expect(currentPage()).toBe("1"));
  });

  it("ignores a drag too short to be a page turn", async () => {
    await renderReader();
    const surface = screen.getByTestId("story-reader");

    fireEvent.pointerDown(surface, { clientX: 300 });
    fireEvent.pointerUp(surface, { clientX: 280 });

    // A child's finger wanders while they point at the picture.
    expect(currentPage()).toBe("1");
  });

  it("replays the current page's narration on the speaker button", async () => {
    await renderReader();

    fireEvent.click(screen.getByRole("button", { name: /hear this page/i }));

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenLastCalledWith(
      "/dev/sharing-monkey-1.en.mp3",
      expect.objectContaining({ interrupt: true }),
    );
    expect(currentPage()).toBe("1");
  });

  it("offers no back arrow on the first page", async () => {
    await renderReader();

    expect(
      screen.queryByRole("button", { name: /page before/i }),
    ).not.toBeInTheDocument();
  });
});

describe("auto-advance", () => {
  it("turns the page a moment after the narration ends", async () => {
    await renderReader();

    await finishNarrationAndWait();

    expect(currentPage()).toBe("2");
  });

  it("holds the page while the narration is still playing", async () => {
    await renderReader();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Nothing has ended, so nothing turns — the hold starts at the end of the
    // clip, not at the start of the page.
    expect(currentPage()).toBe("1");
  });

  it("stays put once the child turns the toggle off", async () => {
    await renderReader();

    fireEvent.click(
      screen.getByRole("button", { name: /pages turn by themselves/i }),
    );
    await finishNarrationAndWait();

    expect(currentPage()).toBe("1");
  });

  it("cancels a pending turn when the child navigates first", async () => {
    await renderReader();

    // The narration has ended and the hold is running when the child taps.
    await act(async () => {
      audio.finishCurrentClip();
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // The page-one timer must not fire on top of the tap — a double turn skips a
    // page of the story outright.
    expect(currentPage()).toBe("2");
  });

  it("does not end the story by itself on the last page", async () => {
    await renderReader();
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));

    await finishNarrationAndWait();

    // The last picture stays on screen until the child says they are done.
    expect(currentPage()).toBe("2");
    expect(screen.queryByTestId("story-finish")).not.toBeInTheDocument();
  });
});

describe("the follow-along highlight", () => {
  /** Two timed words per page, the second reached five seconds in. */
  function timedStory(): StoryDetailResponse {
    return story({
      pages: [1, 2].map((pageNumber) => ({
        pageNumber,
        illustrationUrl: null,
        text: `English page ${pageNumber}.`,
        narrationUrl: `/dev/sharing-monkey-${pageNumber}.en.mp3`,
        narrationTimings: {
          unit: "word" as const,
          spans: [
            { start: 0, end: 7, tMs: 0 },
            { start: 8, end: 12, tMs: 5000 },
          ],
        },
      })),
    });
  }

  function highlighted(): string[] {
    return [...document.querySelectorAll("[data-active='true']")].map(
      (node) => node.textContent ?? "",
    );
  }

  /** The clock the highlight reads, so a page can be dwelt on deterministically. */
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    content.getStory.mockResolvedValue({
      ok: true,
      data: { story: timedStory() },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function tick() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
  }

  it("follows the narration through the page", async () => {
    await renderReader();
    await tick();
    expect(highlighted()).toEqual(["English"]);

    now = 9000;
    await tick();

    expect(highlighted()).toEqual(["page"]);
  });

  it("starts again from the first word on the next page", async () => {
    await renderReader();
    now = 9000;
    await tick();

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));
    await tick();

    // Nine seconds into the story is zero seconds into page two. A clock carried
    // over from page one lights the last word of every page as it opens.
    expect(highlighted()).toEqual(["English"]);
  });

  it("starts again from the first word on a replay", async () => {
    await renderReader();
    now = 9000;
    await tick();

    fireEvent.click(screen.getByRole("button", { name: /hear this page/i }));
    await tick();

    expect(highlighted()).toEqual(["English"]);
  });
});

describe("finishing", () => {
  async function readToTheEnd() {
    await renderReader();
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: /finish the story/i }));
    await screen.findByTestId("story-finish");
  }

  it("shows the moral and what the story was worth", async () => {
    await readToTheEnd();

    expect(screen.getByTestId("story-moral")).toHaveTextContent(
      "Sharing makes playing better",
    );
    await waitFor(() =>
      expect(screen.getByTestId("story-reward")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("story-reward")).toHaveTextContent("5");
  });

  it("silences the page's narration on the way to the ending", async () => {
    await renderReader();
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));
    audio.stop.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /finish the story/i }));
    await screen.findByTestId("story-finish");

    // A child taps "finish" mid-sentence. `FinishScreen` interrupts only when a
    // moral recording exists — and there is none until file 36 — so without this
    // the last page reads itself out over the ending.
    expect(audio.stop).toHaveBeenCalled();
  });

  it("says nothing about the reward until the completion call answers", async () => {
    progress.completeStory.mockReturnValue(new Promise(() => {}));

    await readToTheEnd();

    expect(screen.getByTestId("story-moral")).toBeInTheDocument();
    // "You read it again" is untrue of a first finish. Silence is the only
    // honest placeholder while the answer is still in flight.
    expect(screen.queryByTestId("story-reward")).not.toBeInTheDocument();
  });

  it("reads the moral aloud (FR-STORY-03)", async () => {
    await readToTheEnd();

    expect(audio.play).toHaveBeenLastCalledWith(
      "/dev/sharing-monkey-moral.en.mp3",
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("records the completion once, however many times the story is read", async () => {
    await readToTheEnd();
    expect(progress.completeStory).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /read it again/i }));
    await waitFor(() => expect(currentPage()).toBe("1"));
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(currentPage()).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: /finish the story/i }));
    await screen.findByTestId("story-finish");

    // Replays are free (FR-STORY-06). The server would refuse to pay twice; the
    // reader does not ask a second time either.
    expect(progress.completeStory).toHaveBeenCalledTimes(1);
    expect(progress.completeStory).toHaveBeenCalledWith(STORY_ID);
  });

  it("restarts at page one on Read again", async () => {
    await readToTheEnd();

    fireEvent.click(screen.getByRole("button", { name: /read it again/i }));

    await waitFor(() => expect(currentPage()).toBe("1"));
  });

  it("goes back to the library on More stories", async () => {
    await readToTheEnd();

    fireEvent.click(screen.getByRole("button", { name: /more stories/i }));

    expect(router.push).toHaveBeenCalledWith("/stories");
  });

  it("celebrates a story the child has finished before rather than reporting zero", async () => {
    progress.completeStory.mockResolvedValue({
      ok: true,
      data: { alreadyCompleted: true, granted: null },
    });

    await readToTheEnd();

    // "0 stars and 0 coins" is the one thing this screen must never say.
    await waitFor(() =>
      expect(screen.getByTestId("story-reward")).toHaveTextContent(
        /read it again/i,
      ),
    );
  });

  it("still shows the ending when the completion call fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    progress.completeStory.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "offline" },
    });

    await readToTheEnd();

    // A finished story is finished whether or not the network agreed.
    expect(screen.getByTestId("story-moral")).toBeInTheDocument();
  });
});

describe("stories that cannot be read", () => {
  it("says the story is resting on a 404 rather than showing an error", async () => {
    content.getStory.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "Story not found" },
    });

    render(
      <Providers locale="en">
        <StoryReader storyId={STORY_ID} />
      </Providers>,
    );

    expect(await screen.findByText(/having a rest/i)).toBeInTheDocument();
  });

  it("shows a friendly line for a story with no pages", async () => {
    content.getStory.mockResolvedValue({
      ok: true,
      data: { story: story({ pages: [] }) },
    });

    render(
      <Providers locale="en">
        <StoryReader storyId={STORY_ID} />
      </Providers>,
    );

    expect(await screen.findByText(/no pages yet/i)).toBeInTheDocument();
  });

  it("reads a page that has no recording without waiting for one", async () => {
    content.getStory.mockResolvedValue({
      ok: true,
      data: {
        story: story({
          pages: [
            {
              pageNumber: 1,
              illustrationUrl: null,
              text: "A page nobody has recorded.",
              narrationUrl: null,
              narrationTimings: null,
            },
          ],
        }),
      },
    });

    await renderReader();

    expect(audio.play).not.toHaveBeenCalled();
    expect(screen.getByTestId("narrated-text")).toHaveTextContent(
      "A page nobody has recorded.",
    );
    // No speaker button to tap when there is nothing to hear.
    expect(
      screen.queryByRole("button", { name: /hear this page/i }),
    ).not.toBeInTheDocument();
  });
});
