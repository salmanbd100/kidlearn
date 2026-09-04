"use client";

import type { TraceActivity as TraceDefinition } from "@kidlearn/types";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { ActivityRendererProps } from "./registry";
import { arrowsAlong, type Point, toPathUnits } from "./trace/geometry";
import { useTraceState } from "./trace/use-trace-state";

// Draw the letter with your finger (FR-ACT-02).

const OUTLINE_WIDTH = 11;
const INK_WIDTH = 7;
const GUIDE_WIDTH = 2;
const ARROW_SIZE = 6;

/** Hairline around the marks that mean something, so their edge clears 3:1. */
const MARK_EDGE = 0.8;

/**
 * The start dot is drawn at the tolerance radius, so the thing the child aims at
 * is exactly the thing that counts as a hit. At the default tolerance that is a
 * ~64px target at 360px portrait — the kid floor in design.md §7.
 */
const MIN_START_DOT_RADIUS = 12;

/** Roughly one hint per quarter of the stroke, none of them on either end. */
const ARROW_COUNT = 3;

/** A dot-per-6-units guide: dense enough to read as a line, sparse enough to read as dotted. */
const GUIDE_DOT = 0.1;
const GUIDE_GAP = 6;

function toPolyline(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function TraceActivity({
  definition,
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

  // Where the child should put their finger: the start of the stroke, or wherever
  // they got to if they have already begun and lifted off.
  const startPoint = currentStroke?.points[Math.max(frontier, 0)];

  return (
    <div
      data-testid="activity-trace"
      data-stroke-index={strokeIndex}
      data-stroke-count={strokes.length}
      className="flex min-h-0 flex-1 items-center justify-center"
    >
      {/*
        The announcement a sighted child gets from the dot moving on. `role="status"`
        rather than an `aria-live` region on the board itself, so it speaks the one
        thing that changed instead of re-reading the glyph (FR-I18N-01). Finishing
        is its own line, because clamping the stroke count would otherwise repeat
        the last one and announce nothing at the only moment that matters.
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
        The pointer surface is the svg itself — no overlay, because a transparent
        rect on top would need the same geometry for no gain. `touch-none` is
        load-bearing: without it the browser claims the drag as a scroll and the
        page slides out from under the child's finger mid-letter.

        `role="application"`, not `role="img"`: the board is operable, and an
        `img` would both lie about that and swallow the arrow and space keys a
        screen-reader user needs to trace with (NFR-A11Y-06). `max-h`/`w-auto`
        keep the glyph inside the step in landscape, where the engine lays its
        children out in a row and a percentage height has nothing to resolve
        against.
      */}
      <svg
        ref={svgRef}
        viewBox={frame.viewBox}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the rule reads `svg` as non-interactive from the tag alone; this one is a `role="application"` drawing surface with pointer and key handlers, and removing the tabIndex is what would break NFR-A11Y-06.
        tabIndex={0}
        role="application"
        aria-label={t("activity.trace.label", { glyph: definition.glyph })}
        aria-describedby={instructionsId}
        className="h-full max-h-[70vh] w-auto max-w-full touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            `success`, not `secondary`: this ink means "done", and the
            high-contrast theme sets `--secondary` to the same white as the
            board, which erased every stroke the child had finished.
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
              The halo, not the dot, is what pulses — animating the dot itself
              would move the thing the child is aiming at. Transform and opacity
              only, and stilled for a child who asked for that (design.md §5.2).
            */}
            <circle
              cx={startPoint.x}
              cy={startPoint.y}
              r={startDotRadius}
              className="origin-center fill-accent/40 [transform-box:fill-box] motion-safe:animate-ping"
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

        {/*
          Direction hints go away while the finger is down: by then the child is
          already moving, and three arrows under a hand are clutter over the one
          layer that matters, the trail.
        */}
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
