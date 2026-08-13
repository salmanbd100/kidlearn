import {
  type TraceActivity as TraceDefinition,
  validTrace,
} from "@kidlearn/types";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { TraceActivity } from "./TraceActivity";
import { samplePath, splitStrokes } from "./trace/geometry";
import { type ToViewBox, useTraceState } from "./trace/use-trace-state";
import type { ActivityFeedback } from "./use-activity-feedback";

/**
 * jsdom implements neither `getScreenCTM` nor `SVGPathElement.getPointAtLength`,
 * so a real trace cannot happen here. The gesture rules are therefore driven
 * through `useTraceState` with an identity `toViewBox` — the seam that exists for
 * exactly this — and the render tests below assert only what is on the board.
 */

function feedbackSpy() {
  const spy = {
    success: vi.fn<(anchor?: { x: number; y: number }) => void>(),
    retry: vi.fn<() => void>(),
  };
  return spy satisfies ActivityFeedback;
}

const identity: ToViewBox = (client) => client;

/** A single straight stroke in the reference 0–100 space, easy to walk exactly. */
const singleStroke: TraceDefinition = {
  ...validTrace,
  glyph: "I",
  pathData: "M 0 0 L 0 100",
  strokeOrder: undefined,
};

/** Two separate strokes, so stroke ordering and advancement are observable. */
const twoStrokes: TraceDefinition = {
  ...validTrace,
  glyph: "T",
  pathData: "M 0 0 L 100 0 M 50 0 L 50 100",
  strokeOrder: [0, 1],
};

/**
 * A hand-rolled animation-frame queue. Vitest's fake timers can stand in for
 * `requestAnimationFrame`, but the hook schedules at most one frame per burst of
 * moves and the tests need to say precisely when it drains.
 */
function installFrameQueue() {
  const queued: FrameRequestCallback[] = [];
  let nextHandle = 1;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.push(callback);
    nextHandle += 1;
    return nextHandle;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queued.length = 0;
  });

  return {
    flush() {
      const pending = queued.splice(0, queued.length);
      act(() => {
        for (const callback of pending) callback(0);
      });
    },
    get pending() {
      return queued.length;
    },
  };
}

/**
 * A `PointerEvent` carries a full input snapshot; the hook reads four things off
 * it. The cast stands in for a gesture the environment cannot produce, and
 * narrowing is impossible by construction.
 */
function pointerEvent(x: number, y: number): ReactPointerEvent<SVGSVGElement> {
  const captured = new Set<number>();
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: {
      setPointerCapture: (id: number) => captured.add(id),
      releasePointerCapture: (id: number) => captured.delete(id),
      hasPointerCapture: (id: number) => captured.has(id),
    },
  } as unknown as ReactPointerEvent<SVGSVGElement>;
}

interface TraceHarness {
  result: { current: ReturnType<typeof useTraceState> };
  frames: ReturnType<typeof installFrameQueue>;
  feedback: ReturnType<typeof feedbackSpy>;
  onActivityComplete: ReturnType<typeof vi.fn>;
}

function mountTrace(definition: TraceDefinition): TraceHarness {
  const frames = installFrameQueue();
  const feedback = feedbackSpy();
  const onActivityComplete = vi.fn();
  const { result } = renderHook(() =>
    useTraceState(definition, feedback, onActivityComplete, identity),
  );
  return { result, frames, feedback, onActivityComplete };
}

/** Press at the first point, then drag through every remaining one, a frame each. */
function traceStroke(
  harness: TraceHarness,
  points: readonly { x: number; y: number }[],
) {
  const [first, ...rest] = points;
  if (first === undefined) return;

  act(() =>
    harness.result.current.handlePointerDown(pointerEvent(first.x, first.y)),
  );
  harness.frames.flush();

  for (const point of rest) {
    act(() =>
      harness.result.current.handlePointerMove(pointerEvent(point.x, point.y)),
    );
    harness.frames.flush();
  }
}

function liftFinger(harness: TraceHarness, at = { x: 0, y: 0 }) {
  act(() => harness.result.current.handlePointerUp(pointerEvent(at.x, at.y)));
}

const strokePoints = (definition: TraceDefinition, index: number) =>
  samplePath(
    splitStrokes(definition.pathData, definition.strokeOrder)[index] ?? "",
    40,
  );

describe("useTraceState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits the glyph into one stroke per subpath, in strokeOrder", () => {
    const harness = mountTrace(twoStrokes);
    expect(harness.result.current.strokes).toHaveLength(2);
    expect(harness.result.current.strokes[0]?.points[0]).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("frames the glyph in its own coordinate space, not an assumed one", () => {
    // The canonical "A" is authored in 0–200; a fixed 0–100 viewBox would show a
    // quarter of it.
    const harness = mountTrace(validTrace);
    const [, , width] = harness.result.current.frame.viewBox
      .split(" ")
      .map(Number);
    expect(width).toBeGreaterThan(160);
  });

  it("starts with nothing traced", () => {
    const harness = mountTrace(singleStroke);
    expect(harness.result.current.strokeIndex).toBe(0);
    expect(harness.result.current.frontier).toBe(-1);
    expect(harness.result.current.trail).toHaveLength(0);
  });

  it("draws a trail that follows the finger while it is down", () => {
    const harness = mountTrace(singleStroke);
    const points = strokePoints(singleStroke, 0);

    traceStroke(harness, points.slice(0, 4));

    expect(harness.result.current.trail).toHaveLength(4);
    expect(harness.result.current.isDrawing).toBe(true);
  });

  it("handles at most one move per animation frame", () => {
    const harness = mountTrace(singleStroke);
    const points = strokePoints(singleStroke, 0);
    const first = points[0];
    if (first === undefined) throw new Error("expected sampled points");

    act(() =>
      harness.result.current.handlePointerDown(pointerEvent(first.x, first.y)),
    );
    for (const point of points.slice(1, 8)) {
      act(() =>
        harness.result.current.handlePointerMove(
          pointerEvent(point.x, point.y),
        ),
      );
    }

    // Eight events, one queued frame — the six intermediate positions are dropped
    // rather than each costing a coverage pass and a re-render.
    expect(harness.frames.pending).toBe(1);
    harness.frames.flush();
    expect(harness.result.current.trail).toHaveLength(1);
  });

  it("advances the frontier as the finger moves along the guide", () => {
    const harness = mountTrace(singleStroke);

    traceStroke(harness, strokePoints(singleStroke, 0).slice(0, 10));

    expect(harness.result.current.frontier).toBeGreaterThan(0);
    expect(harness.result.current.strokeIndex).toBe(0);
  });

  it("cheers and moves to the next stroke when one is traced", () => {
    const harness = mountTrace(twoStrokes);

    traceStroke(harness, strokePoints(twoStrokes, 0));

    expect(harness.feedback.success).toHaveBeenCalledTimes(1);
    expect(harness.result.current.strokeIndex).toBe(1);
    expect(harness.result.current.frontier).toBe(-1);
    expect(harness.onActivityComplete).not.toHaveBeenCalled();
  });

  it("cheers over the point the child's finger was on, not the middle of the screen", () => {
    const harness = mountTrace(twoStrokes);
    const points = strokePoints(twoStrokes, 0);

    traceStroke(harness, points);

    // The stroke completes short of its final point, so the anchor is wherever
    // the finger happened to be when the ratio was reached — near the end of the
    // stroke, and one of the positions actually visited.
    const anchor = harness.feedback.success.mock.calls.at(0)?.[0];
    expect(points).toContainEqual(anchor);
    expect(anchor?.x).toBeGreaterThan(50);
  });

  it("reports the activity complete only after the last stroke", () => {
    const harness = mountTrace(twoStrokes);

    traceStroke(harness, strokePoints(twoStrokes, 0));
    liftFinger(harness);
    expect(harness.onActivityComplete).not.toHaveBeenCalled();

    traceStroke(harness, strokePoints(twoStrokes, 1));

    expect(harness.onActivityComplete).toHaveBeenCalledTimes(1);
    expect(harness.feedback.success).toHaveBeenCalledTimes(2);
    expect(harness.result.current.strokeIndex).toBe(2);
  });

  it("requires the strokes in order — the second one cannot be traced first", () => {
    const harness = mountTrace(twoStrokes);

    traceStroke(harness, strokePoints(twoStrokes, 1));

    expect(harness.result.current.strokeIndex).toBe(0);
    expect(harness.feedback.success).not.toHaveBeenCalled();
    expect(harness.onActivityComplete).not.toHaveBeenCalled();
  });

  it("does not complete a stroke when the finger jumps straight to its end", () => {
    const harness = mountTrace(singleStroke);
    const points = strokePoints(singleStroke, 0);
    const last = points.at(-1);
    if (last === undefined) throw new Error("expected sampled points");

    traceStroke(harness, [last, last, last]);

    expect(harness.feedback.success).not.toHaveBeenCalled();
    expect(harness.result.current.strokeIndex).toBe(0);
  });

  it("keeps the progress a lifted finger earned so the child can resume", () => {
    const harness = mountTrace(singleStroke);

    traceStroke(harness, strokePoints(singleStroke, 0).slice(0, 10));
    const reached = harness.result.current.frontier;
    liftFinger(harness);

    expect(harness.result.current.frontier).toBe(reached);
    expect(harness.result.current.trail).toHaveLength(0);
    expect(harness.result.current.isDrawing).toBe(false);
  });

  it("finishes a stroke traced in two goes", () => {
    const harness = mountTrace(singleStroke);
    const points = strokePoints(singleStroke, 0);

    traceStroke(harness, points.slice(0, 20));
    liftFinger(harness);
    traceStroke(harness, points.slice(18));

    expect(harness.feedback.success).toHaveBeenCalledTimes(1);
  });

  it("says nothing discouraging when a gesture made progress but fell short", () => {
    const harness = mountTrace(singleStroke);

    traceStroke(harness, strokePoints(singleStroke, 0).slice(0, 10));
    liftFinger(harness);

    expect(harness.feedback.retry).not.toHaveBeenCalled();
  });

  it("offers gentle encouragement when a whole gesture found nothing (FR-ACT-05)", () => {
    const harness = mountTrace(singleStroke);

    traceStroke(harness, [
      { x: 400, y: 400 },
      { x: 420, y: 420 },
    ]);
    liftFinger(harness);

    expect(harness.feedback.retry).toHaveBeenCalledTimes(1);
    expect(harness.feedback.success).not.toHaveBeenCalled();
    expect(harness.result.current.frontier).toBe(-1);
  });

  it("never ends the activity however many times the child wanders off", () => {
    const harness = mountTrace(singleStroke);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      traceStroke(harness, [{ x: 400, y: 400 }]);
      liftFinger(harness);
    }

    expect(harness.onActivityComplete).not.toHaveBeenCalled();
    expect(harness.feedback.retry).toHaveBeenCalledTimes(5);
  });

  it("does not encourage again after the glyph is already finished", () => {
    const harness = mountTrace(singleStroke);

    traceStroke(harness, strokePoints(singleStroke, 0));
    liftFinger(harness);

    expect(harness.feedback.retry).not.toHaveBeenCalled();
  });

  it("reports completion exactly once, however often it re-renders", () => {
    const frames = installFrameQueue();
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    const { result, rerender } = renderHook(() =>
      useTraceState(singleStroke, feedback, onActivityComplete, identity),
    );
    const harness: TraceHarness = {
      result,
      frames,
      feedback,
      onActivityComplete,
    };

    traceStroke(harness, strokePoints(singleStroke, 0));
    rerender();
    rerender();

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("widens the tolerance when the payload asks it to", () => {
    const points = strokePoints(singleStroke, 0);
    const offset = points.map((point) => ({ x: point.x + 18, y: point.y }));

    const strict = mountTrace({ ...singleStroke, tolerance: 12 });
    traceStroke(strict, offset);
    expect(strict.feedback.success).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    const forgiving = mountTrace({ ...singleStroke, tolerance: 24 });
    traceStroke(forgiving, offset);
    expect(forgiving.feedback.success).toHaveBeenCalledTimes(1);
  });
});

describe("TraceActivity", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  function renderTrace(
    definition: TraceDefinition = twoStrokes,
    locale: "en" | "bn" = "en",
  ) {
    render(
      <Providers locale={locale}>
        <TraceActivity
          definition={definition}
          locale={locale}
          feedback={feedbackSpy()}
          onActivityComplete={vi.fn()}
        />
      </Providers>,
    );
  }

  it("puts the glyph on the board with a dotted guide for the first stroke", () => {
    renderTrace();

    const board = screen.getByTestId("activity-trace");
    expect(board).toHaveAttribute("data-stroke-index", "0");
    expect(board).toHaveAttribute("data-stroke-count", "2");
    expect(screen.getByTestId("trace-guide")).toBeInTheDocument();
  });

  it("shows a start dot and direction arrows before the child begins", () => {
    renderTrace();

    expect(screen.getByTestId("trace-start-dot")).toBeInTheDocument();
    expect(screen.getAllByTestId("trace-arrow")).not.toHaveLength(0);
  });

  it("has no ink on it until something has been traced", () => {
    renderTrace();

    expect(screen.queryByTestId("trace-ink")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trace-progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trace-trail")).not.toBeInTheDocument();
  });

  it("names the glyph to trace in the child's own language", () => {
    renderTrace(twoStrokes, "bn");

    // The glyph itself is the payload's, not the interface's — the instruction
    // wrapped around it is what has to be translated.
    expect(
      screen.getByRole("img", { name: /আঙুল দিয়ে T আঁকো/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("রেখার মধ্যে");
  });

  it("tells a screen-reader user which stroke they are on", () => {
    renderTrace();

    expect(screen.getByRole("status")).toHaveTextContent("Line 1 of 2");
  });

  it("shows no error iconography anywhere on the board (FR-ACT-05)", () => {
    renderTrace();

    expect(screen.getByTestId("activity-trace").textContent).not.toMatch(
      /wrong|try again/i,
    );
  });

  it("frames a glyph authored outside the reference space without clipping it", () => {
    renderTrace(validTrace);

    // The "A" spans 20–180; a 0 0 100 100 viewBox would cut most of it away.
    const viewBox = screen.getByRole("img").getAttribute("viewBox") ?? "";
    const [minX, minY, width, height] = viewBox.split(" ").map(Number);
    expect(minX).toBeLessThanOrEqual(20);
    expect(minY).toBeLessThanOrEqual(20);
    expect((minX ?? 0) + (width ?? 0)).toBeGreaterThanOrEqual(180);
    expect((minY ?? 0) + (height ?? 0)).toBeGreaterThanOrEqual(180);
  });
});
