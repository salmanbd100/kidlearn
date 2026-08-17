import type { LessonDetailResponse } from "@kidlearn/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { A11Y_PREF_CLASSES } from "@/lib/a11y-prefs";
import { resetI18nForTests } from "@/lib/i18n";

/**
 * The celebration, driven by a mocked completion response.
 *
 * The endpoint is stubbed at the module boundary, which is where it is a network
 * call. What this file is about is everything downstream of it: that the numbers
 * on screen are the server's, and that a child who is owed a party gets one
 * whatever the network did.
 */

const LESSON_ID = "33333333-3333-4333-8333-333333333333";

const progress = vi.hoisted(() => ({ completeLesson: vi.fn() }));
vi.mock("@/lib/progress-api", () => progress);

const audio = vi.hoisted(() => ({
  // Typed with its parameter, unlike the other suites' stubs: this one asserts
  // *which* clips played and in what order, so the calls have to be readable.
  play: vi.fn(async (_url: string, _options?: unknown) => {}),
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

const { RewardStep } = await import("./RewardStep");

const LESSON: LessonDetailResponse = {
  id: LESSON_ID,
  slug: "letter-a-sounds",
  title: "The Letter A",
  worldId: "world_jungle",
  world: {
    id: "world_jungle",
    slug: "jungle",
    name: "Jungle World",
    palette: { primary: "#2E7D32" },
    mascot: { id: "media_1", url: "/dev/mascot.png", kind: "image" },
  },
  locale: "en",
  introScript: "Hello!",
  introAudioUrl: null,
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
};

function completion(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      starsEarned: 3,
      coinsEarned: 11,
      newBadges: [],
      totals: { stars: 12, coins: 47 },
      ...overrides,
    },
  };
}

function renderStep() {
  const onComplete = vi.fn();
  render(
    <Providers locale="en">
      <RewardStep lesson={LESSON} onComplete={onComplete} />
    </Providers>,
  );
  return { onComplete };
}

/**
 * Flushes the completion promise, then walks the celebration to its last phase.
 *
 * Once per phase, because each phase's timer is scheduled by the effect that
 * runs *after* the previous one fired — draining the queue in one go would stop
 * at the first handover.
 */
async function settle() {
  await act(async () => {});
  for (const _phase of ["stars", "coins", "mascot"]) {
    act(() => vi.runOnlyPendingTimers());
  }
}

beforeEach(() => {
  resetI18nForTests();
  vi.useFakeTimers();
  audio.play.mockClear();
  progress.completeLesson.mockReset();
  progress.completeLesson.mockResolvedValue(completion());
  // Reduced motion, so the coin count lands on its final value without a frame
  // loop. `CoinCountUp.test.tsx` is where the animation itself is driven.
  document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
});

describe("RewardStep", () => {
  it("finishes the lesson on mount, with no client-supplied amounts", async () => {
    renderStep();
    await settle();

    // One argument, and it is the lesson id. There is nothing here a client
    // could inflate (FR-GAM-08).
    expect(progress.completeLesson).toHaveBeenCalledTimes(1);
    expect(progress.completeLesson).toHaveBeenCalledWith(LESSON_ID);
  });

  it("waits with sparkles rather than a spinner or an empty screen", () => {
    progress.completeLesson.mockReturnValue(new Promise(() => {}));
    renderStep();

    expect(screen.getByTestId("reward-loading")).toBeInTheDocument();
  });

  it("pops one star per star the server granted (FR-GAM-01)", async () => {
    renderStep();
    await settle();

    expect(screen.getAllByTestId("star-burst-star")).toHaveLength(3);
  });

  it("counts the coins the server granted (FR-GAM-02)", async () => {
    renderStep();
    await settle();

    expect(screen.getByTestId("coin-count")).toHaveTextContent("11");
  });

  it("shows the running totals small at the bottom", async () => {
    renderStep();
    await settle();

    const totals = screen.getByTestId("reward-totals");
    expect(totals).toHaveTextContent("12");
    expect(totals).toHaveTextContent("47");
  });

  it("cheers, clinks and then plays the mascot's line", async () => {
    renderStep();
    await settle();

    const played = audio.play.mock.calls.map(([url]) => url);
    expect(played[0]).toMatch(/^\/audio\/feedback\/cheer-\d\.mp3$/);
    expect(played).toContain("/audio/feedback/coin-1.mp3");
    expect(played).toContain("/audio/feedback/celebration-en.mp3");
  });

  it("celebrates a replay that granted nothing, with no error anywhere", async () => {
    progress.completeLesson.mockResolvedValue(
      completion({ starsEarned: 0, coinsEarned: 0 }),
    );
    renderStep();
    await settle();

    // Zero is "you already did this one", not a failure — and the totals still
    // say the child has something.
    expect(screen.queryAllByTestId("star-burst-star")).toHaveLength(0);
    expect(screen.getByTestId("coin-count")).toHaveTextContent("0");
    expect(screen.getByTestId("reward-totals")).toHaveTextContent("12");
    expect(screen.getByRole("button", { name: "Done!" })).toBeInTheDocument();
  });

  it("still celebrates when the request fails, and tells the child nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    progress.completeLesson.mockResolvedValue({
      ok: false,
      error: { code: "NETWORK_ERROR", message: "no" },
    });
    const { onComplete } = renderStep();
    await settle();

    expect(screen.getByRole("button", { name: "Done!" })).toBeInTheDocument();
    expect(screen.queryByTestId("reward-totals")).not.toBeInTheDocument();
    const text = screen.getByText("You did it!").textContent ?? "";
    expect(text).not.toMatch(/sorry|error|wrong|again/i);
    // Logged for an adult, invisible to the child.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("completion not recorded"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Done!" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("advances the player when the child taps Done", async () => {
    const { onComplete } = renderStep();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Done!" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("offers Done from the first frame of the celebration, not only at the end", async () => {
    renderStep();
    // The response has landed but no phase timer has run: a child who taps
    // straight through must not be held on a screen with no way out.
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Done!" })).toBeInTheDocument();
  });

  /**
   * Everything drawn on this screen is `aria-hidden` — the stars, the climbing
   * coins, both totals. This one live region is the entire celebration for a
   * child who cannot see it, so what it says is not a detail.
   */
  describe("the spoken celebration", () => {
    function announcement(): string {
      const status = screen
        .getAllByRole("status")
        .find((node) => node.textContent?.includes("You did it!"));
      return status?.textContent ?? "";
    }

    it("names both counts when both were earned", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ starsEarned: 3, coinsEarned: 11 }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe("You did it! You got 3 stars and 11 coins.");
    });

    it("names only the stars when no coins were earned", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ starsEarned: 2, coinsEarned: 0 }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe("You did it! You got 2 stars.");
    });

    it("names only the coins when no stars were earned", async () => {
      // A replay on a new day: the lesson has already paid its stars, but the
      // day's coins are still there to earn.
      progress.completeLesson.mockResolvedValue(
        completion({ starsEarned: 0, coinsEarned: 5 }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe("You did it! You got 5 coins.");
    });

    it("singularises a count of one", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ starsEarned: 1, coinsEarned: 1 }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe("You did it! You got 1 star and 1 coin.");
    });

    it("never reads zeros out to a replay (FR-LSN-05)", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ starsEarned: 0, coinsEarned: 0 }),
      );
      renderStep();
      await settle();

      // "You got 0 stars and 0 coins" is the failure narration this screen
      // exists to avoid — zero earned is *already done*, and the only channel
      // this child has must say so.
      expect(announcement()).toBe("You did it! You finished the whole lesson.");
      expect(announcement()).not.toMatch(/\b0\b/);
    });

    it("says the same warm thing when the request failed", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      progress.completeLesson.mockResolvedValue({
        ok: false,
        error: { code: "NETWORK_ERROR", message: "no" },
      });
      renderStep();
      await settle();

      // The lesson was finished whether or not the network agreed, and a child
      // who cannot see the screen is owed the same sentence as one who can.
      expect(announcement()).toBe("You did it! You finished the whole lesson.");
      warn.mockRestore();
    });
  });

  it("shows no percentage, score or fraction anywhere", async () => {
    renderStep();
    await settle();

    const text = screen
      .getByRole("button", { name: "Done!" })
      .closest("section")?.textContent;
    expect(text).not.toMatch(/%|score|out of/i);
  });
});
