"use client";

import { Coins } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";

/**
 * Coins ticking up (FR-GAM-02, FR-LSN-05).
 *
 * The number climbing is the whole point: a five-year-old who cannot yet read
 * "11" can watch the pile grow, and the counting is what makes the reward feel
 * earned rather than announced. So this animates the *value*, not a transform —
 * the one place in the app where an animation carries meaning instead of polish.
 *
 * `requestAnimationFrame` rather than an interval, because a step per coin would
 * finish in three frames for a small grant and take a minute for a large one.
 * The ease-out is what a pile of coins does: fast, then settling.
 *
 * Under reduced motion it renders the final number immediately (NFR-A11Y-05).
 * That is the honest reduction here — the information is the total, and the
 * climb is the decoration.
 */

export const COIN_COUNT_DURATION_MS = 1200;

/** Cubic ease-out: quick off the mark, gentle into the total. */
function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export interface CoinCountUpProps {
  from: number;
  to: number;
  durationMs?: number;
  /** Fires once the displayed value has reached `to`, animated or not. */
  onDone?: () => void;
}

export function CoinCountUp({
  from,
  to,
  durationMs = COIN_COUNT_DURATION_MS,
  onDone,
}: CoinCountUpProps) {
  const isMotionReduced = useIsMotionReduced();
  const [value, setValue] = useState(from);

  // Held in a ref so an inline arrow from the caller cannot restart the count on
  // every one of the parent's renders.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (isMotionReduced || to <= from || durationMs <= 0) {
      setValue(to);
      onDoneRef.current?.();
      return;
    }

    let frame = 0;
    let startedAt: number | undefined;

    const tick = (now: number) => {
      startedAt ??= now;
      const progress = Math.min((now - startedAt) / durationMs, 1);
      setValue(Math.round(from + (to - from) * easeOut(progress)));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      onDoneRef.current?.();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, durationMs, isMotionReduced]);

  return (
    <span
      aria-hidden="true"
      data-testid="coin-count"
      className="inline-flex items-center gap-3 font-display text-5xl text-foreground tabular-nums"
    >
      {/*
        Decorative, and the climbing number with it: a value that changes 60
        times a second is unusable to a screen reader, so the whole figure is
        hidden here and the celebration announces the total once instead.
      */}
      <Coins aria-hidden="true" className="size-12 fill-accent text-accent" />
      {value}
    </span>
  );
}
