import type { LessonDetailResponse } from "@kidlearn/types";
import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { createPendingWrites, type PendingWrites } from "../pending-writes";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";

const progress = vi.hoisted(() => ({ completeLesson: vi.fn() }));
vi.mock("@/shared/api/progress-api", () => progress);

const audio = vi.hoisted(() => ({
  // Typed with its parameter: this suite asserts which clips played and in what order.
  play: vi.fn(async (_url: string, _options?: unknown) => {}),
  stop: vi.fn(),
  isPlaying: false,
  muted: false,
  setMuted: vi.fn(),
}));

vi.mock("@/shared/components/AudioProvider", async () => {
  const actual = await vi.importActual<
    typeof import("@/shared/components/AudioProvider")
  >("@/shared/components/AudioProvider");
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
      newCharacters: [],
      streak: { current: 1, milestone: null },
      totals: { stars: 12, coins: 47 },
      ...overrides,
    },
  };
}

const STREAK_STARTER = {
  id: "badge_1",
  slug: "streak-starter",
  name: "Streak Starter",
  iconUrl: null,
};

const MIA = {
  id: "character_1",
  slug: "mia-the-monkey",
  name: "Mia the Monkey",
  imageUrl: null,
};

function renderStep(pendingWrites?: PendingWrites) {
  const onComplete = vi.fn();
  render(
    <Providers locale="en">
      <RewardStep
        lesson={LESSON}
        onComplete={onComplete}
        pendingWrites={pendingWrites}
        locale="en"
      />
    </Providers>,
  );
  return { onComplete };
}

async function settle() {
  await act(async () => {});
  for (let phase = 0; phase < 6; phase += 1) {
    act(() => vi.runOnlyPendingTimers());
  }
}

async function settleTo(count: number) {
  await act(async () => {});
  for (let phase = 0; phase < count; phase += 1) {
    act(() => vi.runOnlyPendingTimers());
  }
}

beforeEach(() => {
  resetI18nForTests();
  vi.useFakeTimers();
  audio.play.mockClear();
  progress.completeLesson.mockReset();
  progress.completeLesson.mockResolvedValue(completion());
  // Reduced motion, so the coin count lands without a frame loop; `CoinCountUp.test.tsx` drives the
  // animation.
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

    // One argument, the lesson id: nothing here a client could inflate (FR-GAM-08).
    expect(progress.completeLesson).toHaveBeenCalledTimes(1);
    expect(progress.completeLesson).toHaveBeenCalledWith(LESSON_ID);
  });

  it("does not finish the lesson until the quiz submission has landed", async () => {
    // The server derives the quiz reward from stored responses, so a completion overtaking a slow
    // quiz upload pays nothing for it.
    const pendingWrites = createPendingWrites();
    let landQuiz = () => {};
    pendingWrites.add(
      new Promise<void>((resolve) => {
        landQuiz = resolve;
      }),
    );
    renderStep(pendingWrites);

    await act(async () => {});
    expect(progress.completeLesson).not.toHaveBeenCalled();

    await act(async () => landQuiz());
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

    // Zero is "already did this one", not a failure.
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
    // The response has landed but no phase timer has run: a child tapping through must not be held
    // with no way out.
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Done!" })).toBeInTheDocument();
  });

  /**
   * Everything drawn is `aria-hidden`; this one live region is the whole celebration for a child
   * who cannot see it.
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
      // A replay on a new day: stars already paid, the day's coins still to earn.
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

      // "0 stars and 0 coins" is the failure narration this screen avoids: zero earned means
      // already done.
      expect(announcement()).toBe("You did it! You finished the whole lesson.");
      expect(announcement()).not.toMatch(/\b0\b/);
    });

    it("names a badge rather than saying one arrived", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          starsEarned: 2,
          coinsEarned: 0,
          newBadges: [STREAK_STARTER],
        }),
      );
      renderStep();
      await settle();

      // "A new badge" tells a child who cannot see the screen nothing about which.
      expect(announcement()).toBe(
        "You did it! You got 2 stars. You unlocked a new badge: Streak Starter.",
      );
    });

    it("joins two unlocks into one readable list", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          starsEarned: 0,
          coinsEarned: 0,
          newBadges: [
            STREAK_STARTER,
            { ...STREAK_STARTER, id: "badge_2", name: "Week Warrior" },
          ],
        }),
      );
      renderStep();
      await settle();

      expect(announcement()).toContain(
        "You unlocked new badges: Streak Starter and Week Warrior.",
      );
    });

    it("names a new character and the streak it was earned alongside", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          starsEarned: 2,
          coinsEarned: 5,
          newCharacters: [MIA],
          streak: { current: 3, milestone: 3 },
        }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe(
        "You did it! You got 2 stars and 5 coins. A new friend joined you: Mia the Monkey. You have learned 3 days in a row!",
      );
    });

    it("says nothing about a streak that reached no milestone", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          starsEarned: 2,
          coinsEarned: 0,
          streak: { current: 5, milestone: null },
        }),
      );
      renderStep();
      await settle();

      expect(announcement()).toBe("You did it! You got 2 stars.");
    });

    it("says the same warm thing when the request failed", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      progress.completeLesson.mockResolvedValue({
        ok: false,
        error: { code: "NETWORK_ERROR", message: "no" },
      });
      renderStep();
      await settle();

      // The lesson was finished whether or not the network agreed, and a child who cannot see is
      // owed the same sentence.
      expect(announcement()).toBe("You did it! You finished the whole lesson.");
      warn.mockRestore();
    });
  });

  /** Each phase is skipped when it has nothing to show, so the ordinary completion is no longer. */
  describe("badges, characters and streaks", () => {
    it("skips every unlock phase when nothing was unlocked", async () => {
      renderStep();
      await settle();

      expect(screen.queryByTestId("badge-reveal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("character-reveal")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("streak-celebration"),
      ).not.toBeInTheDocument();
      // Straight to the end, so a replay is not padded with empty screens.
      expect(screen.getByTestId("reward-mascot")).toBeInTheDocument();
    });

    it("reveals a card per badge the server granted (FR-GAM-04)", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          newBadges: [
            STREAK_STARTER,
            { ...STREAK_STARTER, id: "badge_2", name: "Week Warrior" },
          ],
        }),
      );
      renderStep();
      await settleTo(2);

      const cards = screen.getAllByTestId("badge-reveal");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Streak Starter");
      expect(cards[1]).toHaveTextContent("Week Warrior");
    });

    it("reveals a card per character the server unlocked (FR-GAM-05)", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ newCharacters: [MIA] }),
      );
      renderStep();
      await settleTo(2);

      expect(screen.getByTestId("character-reveal")).toHaveTextContent(
        "Mia the Monkey",
      );
    });

    it("plays the streak celebration only when the server flags a milestone", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({ streak: { current: 3, milestone: 3 } }),
      );
      renderStep();
      await settleTo(2);

      expect(screen.getByTestId("streak-celebration")).toHaveTextContent(
        "3 days in a row!",
      );
    });

    it("plays no streak celebration on a day that reached no milestone", async () => {
      // Day four of a run: the flame marks a streak being reached; one that played daily would stop
      // meaning anything.
      progress.completeLesson.mockResolvedValue(
        completion({ streak: { current: 4, milestone: null } }),
      );
      renderStep();
      await settle();

      expect(
        screen.queryByTestId("streak-celebration"),
      ).not.toBeInTheDocument();
    });

    it("runs badges, then characters, then the streak, then the mascot", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          newBadges: [STREAK_STARTER],
          newCharacters: [MIA],
          streak: { current: 3, milestone: 3 },
        }),
      );
      renderStep();

      await settleTo(2);
      expect(screen.getByTestId("badge-reveal")).toBeInTheDocument();

      await settleTo(1);
      expect(screen.getByTestId("character-reveal")).toBeInTheDocument();
      expect(screen.queryByTestId("badge-reveal")).not.toBeInTheDocument();

      await settleTo(1);
      expect(screen.getByTestId("streak-celebration")).toBeInTheDocument();

      await settleTo(1);
      expect(screen.getByTestId("reward-mascot")).toBeInTheDocument();
    });

    it("plays the unlock and streak clips in order", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          newBadges: [STREAK_STARTER],
          streak: { current: 7, milestone: 7 },
        }),
      );
      renderStep();
      await settle();

      const played = audio.play.mock.calls.map(([url]) => url);
      expect(played).toEqual([
        expect.stringMatching(/^\/audio\/feedback\/cheer-\d\.mp3$/),
        "/audio/feedback/coin-1.mp3",
        "/audio/feedback/unlock-1.mp3",
        "/audio/feedback/streak-en.mp3",
        "/audio/feedback/celebration-en.mp3",
      ]);
    });

    it("offers Done throughout, however many phases there are", async () => {
      progress.completeLesson.mockResolvedValue(
        completion({
          newBadges: [STREAK_STARTER],
          newCharacters: [MIA],
          streak: { current: 3, milestone: 3 },
        }),
      );
      renderStep();
      await settleTo(2);

      // A child who wants out mid-celebration must never be held on a screen with no way off.
      fireEvent.click(screen.getByRole("button", { name: "Done!" }));
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
