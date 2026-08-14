import { validMatch } from "@kidlearn/types";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { evaluatePair } from "./evaluate";
import { MatchActivity } from "./MatchActivity";
import type { ActivityFeedback } from "./use-activity-feedback";
import { usePairing } from "./use-pairing";
import { WIGGLE_MS } from "./use-wiggle";

/**
 * The tap rules are driven through `usePairing` directly, which is the reason
 * that hook exists: they are the part file 22's quiz format reuses, and they are
 * testable without a board. The render tests below cover what a tap does to the
 * markup — the connecting lines are not among them, because jsdom performs no
 * layout, so every card reports a zero-sized box.
 */

const audio = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
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

function feedbackSpy() {
  const spy = {
    success: vi.fn<(anchor?: { x: number; y: number }) => void>(),
    retry: vi.fn<() => void>(),
  };
  // `satisfies`, not an annotation: the tests need the mock's own type to read
  // `.mock.calls`, and this still fails the build if the channel's shape moves.
  return spy satisfies ActivityFeedback;
}

function pairingSpies() {
  return {
    isCorrectPair: vi.fn((leftId: string, rightId: string) =>
      evaluatePair(validMatch, leftId, rightId),
    ),
    onCorrect: vi.fn<(leftId: string, rightId: string) => void>(),
    onWrong: vi.fn<(leftId: string, rightId: string) => void>(),
    onAllMatched: vi.fn<() => void>(),
    totalPairs: validMatch.pairs.length,
  };
}

describe("usePairing", () => {
  it("selects the card that was tapped", () => {
    const { result } = renderHook(() => usePairing(pairingSpies()));

    act(() => result.current.tap("left", "sun"));

    expect(result.current.selected).toEqual({ side: "left", id: "sun" });
  });

  it("deselects when the selected card is tapped again", () => {
    const { result } = renderHook(() => usePairing(pairingSpies()));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("left", "sun"));

    expect(result.current.selected).toBeUndefined();
  });

  it("moves the selection when a second card in the same set is tapped", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("left", "moon"));

    expect(result.current.selected).toEqual({ side: "left", id: "moon" });
    expect(callbacks.onWrong).not.toHaveBeenCalled();
  });

  it("locks a correct pair and reports it", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "day"));

    expect([...result.current.matched]).toEqual([["sun", "day"]]);
    expect(result.current.selected).toBeUndefined();
    expect(callbacks.onCorrect).toHaveBeenCalledWith("sun", "day");
    expect(callbacks.onWrong).not.toHaveBeenCalled();
  });

  it("locks the same pair tapped right set first (FR-ACT-03)", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("right", "day"));
    act(() => result.current.tap("left", "sun"));

    expect([...result.current.matched]).toEqual([["sun", "day"]]);
    expect(callbacks.onCorrect).toHaveBeenCalledWith("sun", "day");
  });

  it("gives both cards of a pair the same colour, and each pair its own", () => {
    const { result } = renderHook(() => usePairing(pairingSpies()));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "day"));
    act(() => result.current.tap("left", "moon"));
    act(() => result.current.tap("right", "night"));

    expect(result.current.pairIndexOf("sun")).toBe(
      result.current.pairIndexOf("day"),
    );
    expect(result.current.pairIndexOf("moon")).toBe(
      result.current.pairIndexOf("night"),
    );
    expect(result.current.pairIndexOf("sun")).not.toBe(
      result.current.pairIndexOf("moon"),
    );
  });

  it("keeps a matched card's colour when a later pair is matched", () => {
    const { result } = renderHook(() => usePairing(pairingSpies()));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "day"));
    const first = result.current.pairIndexOf("sun");
    act(() => result.current.tap("left", "moon"));
    act(() => result.current.tap("right", "night"));

    expect(result.current.pairIndexOf("sun")).toBe(first);
  });

  it("clears the selection and asks for another go on a wrong pair (FR-ACT-05)", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "night"));

    expect(result.current.matched.size).toBe(0);
    expect(result.current.selected).toBeUndefined();
    expect(callbacks.onWrong).toHaveBeenCalledWith("sun", "night");
    expect(callbacks.onCorrect).not.toHaveBeenCalled();
  });

  it("gives the child unlimited retries — a wrong pair never ends the activity", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      act(() => result.current.tap("left", "sun"));
      act(() => result.current.tap("right", "night"));
    }

    expect(callbacks.onWrong).toHaveBeenCalledTimes(5);
    expect(callbacks.onAllMatched).not.toHaveBeenCalled();
  });

  it("ignores a tap on a card that is already matched", () => {
    const callbacks = pairingSpies();
    const { result } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "day"));
    act(() => result.current.tap("left", "sun"));

    expect(result.current.selected).toBeUndefined();
    expect(callbacks.onWrong).not.toHaveBeenCalled();
  });

  it("reports every pair matched, once, when the last one lands", () => {
    const callbacks = pairingSpies();
    const { result, rerender } = renderHook(() => usePairing(callbacks));

    act(() => result.current.tap("left", "sun"));
    act(() => result.current.tap("right", "day"));
    expect(callbacks.onAllMatched).not.toHaveBeenCalled();

    act(() => result.current.tap("left", "moon"));
    act(() => result.current.tap("right", "night"));
    rerender();
    rerender();

    expect(callbacks.onAllMatched).toHaveBeenCalledTimes(1);
  });
});

describe("MatchActivity", () => {
  beforeEach(() => {
    resetI18nForTests();
    audio.play.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderActivity(locale: "en" | "bn" = "en") {
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    render(
      <Providers locale={locale}>
        <MatchActivity
          definition={validMatch}
          locale={locale}
          feedback={feedback}
          onActivityComplete={onActivityComplete}
        />
      </Providers>,
    );
    return { feedback, onActivityComplete };
  }

  function tapCard(id: string) {
    fireEvent.click(screen.getByTestId(`match-card-${id}`));
  }

  it("puts every card of both sets on the board", () => {
    renderActivity();

    for (const id of ["sun", "moon", "day", "night"]) {
      expect(screen.getByTestId(`match-card-${id}`)).toBeInTheDocument();
    }
  });

  it("labels each card in the child's own language, not the payload's first one", () => {
    renderActivity("bn");

    expect(screen.getByTestId("match-card-sun")).toHaveTextContent("সূর্য");
    expect(screen.getByTestId("match-card-night")).toHaveTextContent("রাত");
  });

  it("marks the tapped card as picked", () => {
    renderActivity();

    tapCard("sun");

    expect(screen.getByTestId("match-card-sun")).toHaveAttribute(
      "data-state",
      "selected",
    );
  });

  it("locks both cards of a correct pair and cheers", () => {
    const { feedback } = renderActivity();

    tapCard("sun");
    tapCard("day");

    expect(screen.getByTestId("match-card-sun")).toHaveAttribute(
      "data-state",
      "matched",
    );
    expect(screen.getByTestId("match-card-day")).toHaveAttribute(
      "data-state",
      "matched",
    );
    expect(feedback.success).toHaveBeenCalledTimes(1);
  });

  it("draws one connecting line per matched pair", () => {
    renderActivity();

    expect(screen.queryAllByTestId("match-line")).toHaveLength(0);

    tapCard("sun");
    tapCard("day");

    expect(screen.getAllByTestId("match-line")).toHaveLength(1);
  });

  it("leaves a wrong pair unlocked and encourages instead (FR-ACT-05)", () => {
    const { feedback } = renderActivity();

    tapCard("sun");
    tapCard("night");

    expect(screen.getByTestId("match-card-sun")).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(screen.getByTestId("match-card-night")).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(feedback.retry).toHaveBeenCalledTimes(1);
    expect(feedback.success).not.toHaveBeenCalled();
  });

  it("speaks the card the child tapped, in their own language", () => {
    renderActivity("bn");
    audio.play.mockClear();

    tapCard("sun");

    expect(audio.play).toHaveBeenCalledWith(
      validMatch.leftSet[0].audio?.bn.url,
      expect.objectContaining({ interrupt: true }),
    );
  });

  it("stays silent for a card the payload gives no voice", () => {
    renderActivity();
    audio.play.mockClear();

    tapCard("day");

    expect(audio.play).not.toHaveBeenCalled();
  });

  it("reports completion when the last pair is matched", () => {
    const { onActivityComplete } = renderActivity();

    tapCard("sun");
    tapCard("day");
    expect(onActivityComplete).not.toHaveBeenCalled();

    tapCard("moon");
    tapCard("night");

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("shows no error iconography anywhere on the board (FR-ACT-05)", () => {
    renderActivity();

    tapCard("sun");
    tapCard("night");

    expect(screen.queryByText("✗")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-match").textContent).not.toMatch(
      /wrong|try again/i,
    );
  });

  it("stops shaking once the animation has run", () => {
    vi.useFakeTimers();
    renderActivity();

    tapCard("sun");
    tapCard("night");
    act(() => {
      vi.advanceTimersByTime(WIGGLE_MS);
    });

    expect(screen.getByTestId("match-card-sun").innerHTML).not.toMatch(
      /animate-wiggle/,
    );
  });
});
