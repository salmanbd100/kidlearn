"use client";

import type { TraceActivity } from "@kidlearn/types";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActivityFeedback } from "@/features/activities/use-activity-feedback";
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

const SAMPLES_PER_STROKE = 40;

const KEYBOARD_STEP = 4;

export interface TraceStroke {
  /** A glyph may repeat a subpath (the two dots of an "ï"), so `d` is not an identity. */
  id: string;
  d: string;
  points: Point[];
}

export type ToViewBox = (client: Point) => Point | undefined;

export interface TraceState {
  strokes: readonly TraceStroke[];
  frame: GlyphFrame;
  strokeIndex: number;
  frontier: number;
  trail: readonly Point[];
  isDrawing: boolean;
  tolerance: number;
  svgRef: RefObject<SVGSVGElement | null>;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handleKeyDown: (event: ReactKeyboardEvent<SVGSVGElement>) => void;
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
  const activePointerRef = useRef<number | undefined>(undefined);
  const coverageRef = useRef<CoverageState>(createCoverage(0));
  const trailRef = useRef<Point[]>([]);
  const pendingRef = useRef<{ view: Point; client: Point } | undefined>(
    undefined,
  );
  const animationFrameRef = useRef<number | undefined>(undefined);
  const hasProgressedRef = useRef(false);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    strokeIndexRef.current = 0;
    coverageRef.current = createCoverage(strokes[0]?.points.length ?? 0);
    trailRef.current = [];
    activePointerRef.current = undefined;
    hasCompletedRef.current = false;
    setIsDrawing(false);
    setStrokeIndex(0);
    setFrontier(-1);
    setTrail([]);
  }, [strokes]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== undefined) {
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

  const finishStroke = useCallback(
    (anchor?: Point) => {
      feedback.success(anchor);
      trailRef.current = [];
      setTrail([]);

      const next = strokeIndexRef.current + 1;
      strokeIndexRef.current = next;
      setStrokeIndex(next);
      setFrontier(-1);
      coverageRef.current = createCoverage(strokes[next]?.points.length ?? 0);

      if (next < strokes.length || hasCompletedRef.current) return;
      // Past the last stroke every stroke renders as ink, so the glyph is solid under the
      // celebration.
      hasCompletedRef.current = true;
      onActivityComplete();
    },
    [strokes, feedback, onActivityComplete],
  );

  const drainPendingMove = useCallback(() => {
    animationFrameRef.current = undefined;

    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending === undefined) return;

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
      if (animationFrameRef.current !== undefined) return;
      animationFrameRef.current = requestAnimationFrame(drainPendingMove);
    },
    [convert, drainPendingMove],
  );

  const traceAhead = useCallback(() => {
    const stroke = strokes[strokeIndexRef.current];
    if (stroke === undefined) return;

    let state = coverageRef.current;
    const target = Math.min(
      state.frontier + KEYBOARD_STEP,
      stroke.points.length - 1,
    );
    for (let index = Math.max(state.frontier, 0); index <= target; index += 1) {
      const point = stroke.points[index];
      if (point === undefined) continue;
      state = updateCoverage(stroke.points, state, point, tolerance);
    }
    if (state === coverageRef.current) return;

    coverageRef.current = state;
    setFrontier(state.frontier);

    if (isStrokeComplete(state, stroke.points.length)) {
      finishStroke();
    }
  }, [strokes, tolerance, finishStroke]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<SVGSVGElement>) => {
      if (
        event.key !== " " &&
        event.key !== "Enter" &&
        event.key !== "ArrowRight"
      ) {
        return;
      }
      // Space would scroll the lesson out from under the child.
      event.preventDefault();
      traceAhead();
    },
    [traceAhead],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // A second contact (resting thumb, palm) is not a new gesture; the board belongs to the
      // pointer that opened it.
      if (activePointerRef.current !== undefined) return;
      activePointerRef.current = event.pointerId;

      // Capture, so a finger wandering off the glyph or screen edge keeps feeding this element.
      event.currentTarget.setPointerCapture(event.pointerId);
      hasProgressedRef.current = false;
      trailRef.current = [];
      setTrail([]);
      setIsDrawing(true);
      queueMove(event);
    },
    [queueMove],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (activePointerRef.current !== event.pointerId) return;
      queueMove(event);
    },
    [queueMove],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (activePointerRef.current !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activePointerRef.current = undefined;
      setIsDrawing(false);

      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      pendingRef.current = undefined;

      // Coverage survives the lift so the child resumes; the trail does not, as its progress is
      // already ink.
      trailRef.current = [];
      setTrail([]);

      // Nothing covered means the finger never found the guide: the only moment for a gentle nudge,
      // never a failure (FR-ACT-05).
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
    tolerance,
    svgRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
  };
}
