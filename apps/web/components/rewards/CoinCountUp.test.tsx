import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A11Y_PREF_CLASSES } from "@/lib/a11y-prefs";
import { CoinCountUp } from "./CoinCountUp";

/**
 * The one animation in the app that carries information rather than polish, so
 * it is driven here rather than observed: `requestAnimationFrame` is replaced
 * with a queue the test steps by hand, which is the only way to assert the
 * intermediate values a child actually watches.
 */

/**
 * Frames pending, in call order. `paint(ms)` moves the clock on and delivers
 * them.
 */
let frames: FrameRequestCallback[] = [];
let now = 0;

function paint(ms = 0) {
  now += ms;
  const due = frames;
  frames = [];
  act(() => {
    for (const frame of due) frame(now);
  });
}

beforeEach(() => {
  frames = [];
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
});

function value(): number {
  return Number(screen.getByTestId("coin-count").textContent);
}

describe("CoinCountUp", () => {
  it("starts at the from value before a frame has run", () => {
    render(<CoinCountUp from={0} to={11} durationMs={1200} />);

    expect(value()).toBe(0);
  });

  it("climbs towards the total and lands exactly on it", () => {
    render(<CoinCountUp from={0} to={11} durationMs={1200} />);

    paint();
    paint(600);
    const midway = value();
    // Eased out, so half the time is already well past half the coins — what
    // matters is that it is between the two and moving.
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(11);

    paint(600);
    expect(value()).toBe(11);
  });

  it("never overshoots when a frame lands after the duration", () => {
    render(<CoinCountUp from={0} to={7} durationMs={1200} />);

    paint();
    // A backgrounded tab delivers one very late frame instead of seventy.
    paint(10_000);

    expect(value()).toBe(7);
  });

  it("shows the final number immediately under reduced motion (NFR-A11Y-05)", () => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);

    render(<CoinCountUp from={0} to={11} durationMs={1200} />);

    // The information is the total; the climb is the decoration.
    expect(value()).toBe(11);
    expect(frames).toHaveLength(0);
  });

  it("reports done once the total is reached", () => {
    const onDone = vi.fn();
    render(<CoinCountUp from={0} to={4} durationMs={1000} onDone={onDone} />);

    paint();
    paint(500);
    expect(onDone).not.toHaveBeenCalled();

    paint(500);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("settles on zero without animating when nothing was earned", () => {
    const onDone = vi.fn();
    // A replay grants nothing. The screen still shows the coin, at zero, rather
    // than an empty gap where a number belongs.
    render(<CoinCountUp from={0} to={0} onDone={onDone} />);

    expect(value()).toBe(0);
    expect(frames).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
