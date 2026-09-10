"use client";

import type { RefObject } from "react";

/** The surface success is drawn on (FR-ACT-05). */
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
