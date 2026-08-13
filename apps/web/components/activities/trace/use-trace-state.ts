"use client";

import type { TraceActivity } from "@kidlearn/types";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActivityFeedback } from "../use-activity-feedback";
import {
  type CoverageState,
  createCoverage,
  DEFAULT_TOLERANCE,
  isStrokeComplete,
  updateCoverage,
} from "./coverage";
import {
  type GlyphFrame,
  glyphFrameOf,
  type Point,
  samplePath,
  splitStrokes,
  toPathUnits,
} from "./geometry";

/**
 * The tracing gesture, from the first touch to the finished glyph.
 *
 * **Why the pointer work is a hook and not part of the renderer.** jsdom has no
 * layout and no SVG matrix, so nothing about a real trace can be reproduced in a
 * component test. Everything that decides whether the child got it right lives
 * here instead, driven through `toViewBox` — the one seam that reads the DOM —
 * so the rules are testable and the renderer is only markup.
 *
 * **`pointermove` fires far faster than the screen repaints.** Handling each
 * event would run coverage and set React state dozens of times per frame. Moves
 * are therefore parked in a ref and drained once per animation frame, and the
 * frame only touches state when the covered count or the stroke index actually
 * moved — `updateCoverage` returns its argument unchanged when nothing did, which
 * is what makes that check a pointer comparison (NFR-PERF).
 */

/** Points sampled per stroke. Fine enough to follow a curve, coarse enough to stay cheap. */
const SAMPLES_PER_STROKE = 40;

export interface TraceStroke {
  /**
   * Which stroke of the glyph this is, in trace order. A glyph may legitimately
   * repeat a subpath — the two dots of an "ï" — so `d` is not an identity.
   */
  id: string;
  /** The subpath, ready for a `<path d>`. */
  d: string;
  points: Point[];
}

/** Client coordinates in, glyph coordinates out. Injected so tests need no SVG matrix. */
export type ToViewBox = (client: Point) => Point | undefined;

export interface TraceState {
  strokes: readonly TraceStroke[];
  frame: GlyphFrame;
  /** Strokes below this index are finished ink; equal to `strokes.length` when the glyph is done. */
  strokeIndex: number;
  /** Furthest covered point of the current stroke, or `-1`. Drives the progress ink and the resume dot. */
  frontier: number;
  /** The current gesture's path, cleared the moment the finger lifts. */
  trail: readonly Point[];
  isDrawing: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

function buildStrokes(definition: TraceActivity): TraceStroke[] {
  return splitStrokes(definition.pathData, definition.strokeOrder)
    .map((d, order) => ({
      id: `stroke-${order}`,
      d,
      points: samplePath(d, SAMPLES_PER_STROKE),
    }))
    .filter((stroke) => stroke.points.length > 0);
}

export function useTraceState(
  definition: TraceActivity,
  feedback: ActivityFeedback,
  onActivityComplete: () => void,
  toViewBox?: ToViewBox,
): TraceState {
  const strokes = useMemo(() => buildStrokes(definition), [definition]);
  const frame = useMemo(
    () => glyphFrameOf(strokes.flatMap((stroke) => stroke.points)),
    [strokes],
  );
  const tolerance = useMemo(
    () => toPathUnits(definition.tolerance ?? DEFAULT_TOLERANCE, frame),
    [definition.tolerance, frame],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);

  const [strokeIndex, setStrokeIndex] = useState(0);
  const [frontier, setFrontier] = useState(-1);
  const [trail, setTrail] = useState<readonly Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const strokeIndexRef = useRef(0);
  /** Mirrors `isDrawing`, because a move can arrive before the state re-render lands. */
  const isDrawingRef = useRef(false);
  const coverageRef = useRef<CoverageState>(createCoverage(0));
  const trailRef = useRef<Point[]>([]);
  const pendingRef = useRef<{ view: Point; client: Point } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  /** Did this gesture cover anything? Decides whether lifting off earns encouragement. */
  const hasProgressedRef = useRef(false);
  const hasCompletedRef = useRef(false);

  // A new payload is a new glyph: the child starts again from the first stroke.
  useEffect(() => {
    strokeIndexRef.current = 0;
    coverageRef.current = createCoverage(strokes[0]?.points.length ?? 0);
    trailRef.current = [];
    isDrawingRef.current = false;
    hasCompletedRef.current = false;
    setIsDrawing(false);
    setStrokeIndex(0);
    setFrontier(-1);
    setTrail([]);
  }, [strokes]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const convert = useCallback(
    (client: Point): Point | undefined => {
      if (toViewBox !== undefined) return toViewBox(client);

      const svg = svgRef.current;
      const matrix = svg?.getScreenCTM();
      if (matrix === null || matrix === undefined) return undefined;

      const { x, y } = new DOMPoint(client.x, client.y).matrixTransform(
        matrix.inverse(),
      );
      return { x, y };
    },
    [toViewBox],
  );

  /**
   * The stroke is done. Its coverage becomes permanent ink, the loose trail goes,
   * and the start dot moves on — or, on the last stroke, the glyph is finished
   * and the engine takes over for the celebration.
   */
  const finishStroke = useCallback(
    (anchor: Point) => {
      feedback.success(anchor);
      trailRef.current = [];
      setTrail([]);

      const next = strokeIndexRef.current + 1;
      strokeIndexRef.current = next;
      setStrokeIndex(next);
      setFrontier(-1);
      coverageRef.current = createCoverage(strokes[next]?.points.length ?? 0);

      if (next < strokes.length || hasCompletedRef.current) return;
      // `strokeIndex === strokes.length` renders every stroke as ink, so the
      // glyph is solid underneath the engine's celebration overlay.
      hasCompletedRef.current = true;
      onActivityComplete();
    },
    [strokes, feedback, onActivityComplete],
  );

  const drainPendingMove = useCallback(() => {
    animationFrameRef.current = null;

    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;

    const stroke = strokes[strokeIndexRef.current];
    if (stroke === undefined) return;

    trailRef.current = [...trailRef.current, pending.view];
    setTrail(trailRef.current);

    const next = updateCoverage(
      stroke.points,
      coverageRef.current,
      pending.view,
      tolerance,
    );
    if (next === coverageRef.current) return;

    coverageRef.current = next;
    hasProgressedRef.current = true;
    setFrontier(next.frontier);

    if (isStrokeComplete(next, stroke.points.length)) {
      finishStroke(pending.client);
    }
  }, [strokes, tolerance, finishStroke]);

  const queueMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const client = { x: event.clientX, y: event.clientY };
      const view = convert(client);
      if (view === undefined) return;

      pendingRef.current = { view, client };
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = requestAnimationFrame(drainPendingMove);
    },
    [convert, drainPendingMove],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Capture, so a finger that wanders off the glyph — or off the screen edge
      // — keeps feeding this element instead of silently ending the stroke.
      event.currentTarget.setPointerCapture(event.pointerId);
      hasProgressedRef.current = false;
      trailRef.current = [];
      setTrail([]);
      isDrawingRef.current = true;
      setIsDrawing(true);
      queueMove(event);
    },
    [queueMove],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;
      queueMove(event);
    },
    [queueMove],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      isDrawingRef.current = false;
      setIsDrawing(false);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingRef.current = null;

      // Coverage survives the lift — the child resumes where they stopped — but
      // the loose trail does not, because everything it earned is already drawn
      // as progress ink and the rest was a wander.
      trailRef.current = [];
      setTrail([]);

      // Nothing covered by that whole gesture means the finger never found the
      // guide. That is the only moment worth speaking up, and it is a gentle
      // nudge, never a failure (FR-ACT-05).
      if (
        strokeIndexRef.current < strokes.length &&
        !hasProgressedRef.current
      ) {
        feedback.retry();
      }
    },
    [strokes.length, feedback],
  );

  return {
    strokes,
    frame,
    strokeIndex,
    frontier,
    trail,
    isDrawing,
    svgRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
