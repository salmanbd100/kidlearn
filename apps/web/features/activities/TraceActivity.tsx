"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type { TraceActivity as TraceDefinition } from "@kidlearn/types";
import { useEffect, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { oopsAudioUrl } from "@/shared/components/kid/feedback-audio";
import { ActivityUnavailable } from "./ActivityUnavailable";
import type { ActivityRendererProps } from "./registry";
import { arrowsAlong, type Point, toPathUnits } from "./trace/geometry";
import { useTraceState } from "./trace/use-trace-state";

const OUTLINE_WIDTH = 11;
const INK_WIDTH = 7;
const GUIDE_WIDTH = 2;
const ARROW_SIZE = 6;

const MARK_EDGE = 0.8;

/**
 * The start dot is drawn at the tolerance radius so the aim target is the hit target: ~64px at
 * 360px portrait, the kid floor (design.md §7).
 */
const MIN_START_DOT_RADIUS = 12;

const ARROW_COUNT = 3;

const GUIDE_DOT = 0.1;
const GUIDE_GAP = 6;

function toPolyline(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function TraceActivity({
  definition,
  locale,
  feedback,
  onActivityComplete,
}: ActivityRendererProps<TraceDefinition>) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const instructionsId = useId();
  const {
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
  } = useTraceState(definition, feedback, onActivityComplete);

  const hasNoStrokes = strokes.length === 0;

  useEffect(() => {
    if (!hasNoStrokes) return;
    // `pathData` passes the schema without being parseable as SVG, so engine validation never sees
    // it; this is the only trace.
    console.error(
      "[kidlearn] trace path produced no strokes",
      definition.glyph,
    );
  }, [hasNoStrokes, definition.glyph]);

  const currentStroke = strokes[strokeIndex];
  const isFinished = strokes.length > 0 && strokeIndex >= strokes.length;

  const arrows = useMemo(
    () =>
      currentStroke === undefined
        ? []
        : arrowsAlong(currentStroke.d, ARROW_COUNT),
    [currentStroke],
  );

  const unit = (length: number) => toPathUnits(length, frame);
  const inkWidth = unit(INK_WIDTH);
  const markEdge = unit(MARK_EDGE);
  const startDotRadius = Math.max(tolerance, unit(MIN_START_DOT_RADIUS));

  const coveredPoints =
    currentStroke === undefined || frontier < 0
      ? []
      : currentStroke.points.slice(0, frontier + 1);

  const startPoint = currentStroke?.points[Math.max(frontier, 0)];

  if (hasNoStrokes) {
    return (
      <ActivityUnavailable
        message={t("activity.oops")}
        audioUrl={oopsAudioUrl(locale)}
        onSkip={onActivityComplete}
      />
    );
  }

  return (
    <div
      data-testid="activity-trace"
      data-stroke-index={strokeIndex}
      data-stroke-count={strokes.length}
      className="flex min-h-0 flex-1 items-center justify-center"
    >
      {/*
        `role="status"` rather than `aria-live` on the board, so only the change is spoken
        (FR-I18N-01). Finishing is its own line: clamping the stroke count would repeat the last
        one.
      */}
      <span role="status" className="sr-only">
        {isFinished
          ? t("activity.trace.done", { glyph: definition.glyph })
          : t("activity.trace.progress", {
              current: Math.min(strokeIndex + 1, strokes.length),
              total: strokes.length,
            })}
      </span>

      <span id={instructionsId} className="sr-only">
        {t("activity.trace.keyboard")}
      </span>

      {/*
        The svg is the pointer surface. `touch-none` is load-bearing: otherwise the browser claims
        the drag as a scroll. `role="application"`, not `img`: the board is operable and `img`
        swallows the arrow/space keys (NFR-A11Y-06). `max-h`/`w-auto` keep the glyph in the step
        in landscape.
      */}
      <svg
        ref={svgRef}
        viewBox={frame.viewBox}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the rule reads `svg` as non-interactive from the tag alone; this one is a `role="application"` drawing surface with pointer and key handlers, and removing the tabIndex is what would break NFR-A11Y-06.
        tabIndex={0}
        role="application"
        aria-label={t("activity.trace.label", { glyph: definition.glyph })}
        aria-describedby={instructionsId}
        className="h-full max-h-[70dvh] w-auto max-w-full touch-none select-none focus-ring"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d={definition.pathData}
            className="stroke-muted-foreground/20"
            strokeWidth={unit(OUTLINE_WIDTH)}
          />

          {currentStroke === undefined ? null : (
            <path
              d={currentStroke.d}
              data-testid="trace-guide"
              className="stroke-muted-foreground"
              strokeWidth={unit(GUIDE_WIDTH)}
              strokeDasharray={`${unit(GUIDE_DOT)} ${unit(GUIDE_GAP)}`}
            />
          )}

          {/*
            `success`, not `secondary`: high-contrast sets `--secondary` to the board's white, which
            erased finished strokes.
          */}
          {strokes.slice(0, strokeIndex).map((stroke) => (
            <path
              key={stroke.id}
              d={stroke.d}
              data-testid="trace-ink"
              className="stroke-success"
              strokeWidth={inkWidth}
            />
          ))}

          {coveredPoints.length < 2 ? null : (
            <polyline
              data-testid="trace-progress"
              points={toPolyline(coveredPoints)}
              className="stroke-success"
              strokeWidth={inkWidth}
            />
          )}

          {trail.length < 2 ? null : (
            <polyline
              data-testid="trace-trail"
              points={toPolyline(trail)}
              className="stroke-primary"
              strokeWidth={inkWidth}
            />
          )}
        </g>

        {startPoint === undefined ? null : (
          <g data-testid="trace-start-dot">
            {/*
              The halo pulses, not the dot, which the child is aiming at. Transform and opacity only
              (design.md §5.2).
            */}
            <circle
              cx={startPoint.x}
              cy={startPoint.y}
              r={startDotRadius}
              className="origin-center fill-accent/40 transform-fill motion-safe:animate-ping"
            />
            <circle
              cx={startPoint.x}
              cy={startPoint.y}
              r={startDotRadius}
              className="fill-accent stroke-foreground"
              strokeWidth={markEdge}
            />
          </g>
        )}

        {/* Direction hints go away while the finger is down; they would clutter the trail. */}
        {isDrawing
          ? null
          : arrows.map((arrow) => (
              <path
                key={arrow.order}
                data-testid="trace-arrow"
                d={`M ${-ARROW_SIZE} ${-ARROW_SIZE} L ${ARROW_SIZE} 0 L ${-ARROW_SIZE} ${ARROW_SIZE} Z`}
                className="fill-primary stroke-foreground"
                strokeWidth={MARK_EDGE}
                transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle}) scale(${frame.unit})`}
              />
            ))}
      </svg>
    </div>
  );
}
