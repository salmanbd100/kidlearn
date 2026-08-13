"use client";

import type { RefObject } from "react";

/**
 * The surface success is drawn on (FR-ACT-05).
 *
 * A single fixed canvas above the whole step, and deliberately inert: confetti
 * bursting over the target a child just touched must never intercept the next
 * tap, and a pre-reader will tap again immediately. `aria-hidden` for the same
 * reason it is `pointer-events-none` — the celebration is decoration, and the
 * cheer that plays with it is what a screen reader user is given instead.
 */
export function FeedbackLayer({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    // The wrapper carries `aria-hidden`, not the canvas: a canvas is focusable,
    // and hiding a focusable element from the accessibility tree leaves it
    // reachable by tab but nameless to whoever lands on it.
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        data-testid="activity-feedback-layer"
        className="size-full"
      />
    </div>
  );
}
