"use client";

import type { RefObject } from "react";

export function FeedbackLayer({
  canvasRef,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    // `aria-hidden` on the wrapper, not the canvas: a focusable canvas hidden from the a11y tree is
    // tabbable but nameless.
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
