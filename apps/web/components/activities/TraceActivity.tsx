"use client";

import type { TraceActivity as TraceDefinition } from "@kidlearn/types";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { ActivityRendererProps } from "./registry";
import { arrowsAlong, type Point, toPathUnits } from "./trace/geometry";
import { useTraceState } from "./trace/use-trace-state";

/**
 * Draw the letter with your finger (FR-ACT-02).
 *
 * **Six layers over one glyph, drawn back to front.** A faint outline of the
 * whole letter so the child can see what they are making; a dotted guide on the
 * stroke they are on now; the strokes they have already finished, solid; the part
 * of the current stroke they have covered, equally solid, because progress that
 * survives lifting a finger is what makes a half-traced letter resumable rather
 * than a restart; the live crayon trail; and a pulsing dot saying *start here*
 * with arrows saying *this way*.
 *
 * **Nothing on this board can be wrong.** Wandering off the guide draws a trail
 * that covers nothing and is wiped when the finger lifts — no cross, no shake,
 * no counter. The only thing a fruitless gesture earns is an encouraging voice
 * (FR-ACT-05), and only when the whole gesture found nothing at all.
 *
 * **Every length here is written in the reference 0–100 glyph space** and
 * converted through `toPathUnits`. Payload coordinates are not normalised — the
 * canonical "A" is authored in 0–200 — so a hard-coded `strokeWidth` would be
 * half as thick on one glyph as on another.
 */

const OUTLINE_WIDTH = 11;
const INK_WIDTH = 7;
const GUIDE_WIDTH = 2;
const START_DOT_RADIUS = 5;
const ARROW_SIZE = 4;

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
  const {
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
  } = useTraceState(definition, feedback, onActivityComplete);

  const currentStroke = strokes[strokeIndex];

  const arrows = useMemo(
    () =>
      currentStroke === undefined
        ? []
        : arrowsAlong(currentStroke.d, ARROW_COUNT),
    [currentStroke],
  );

  const unit = (length: number) => toPathUnits(length, frame);
  const inkWidth = unit(INK_WIDTH);

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
        thing that changed instead of re-reading the glyph (FR-I18N-01).
      */}
      <span role="status" className="sr-only">
        {t("activity.trace.progress", {
          current: Math.min(strokeIndex + 1, strokes.length),
          total: strokes.length,
        })}
      </span>

      {/*
        The pointer surface is the svg itself — no overlay, because a transparent
        rect on top would need the same geometry for no gain. `touch-none` is
        load-bearing: without it the browser claims the drag as a scroll and the
        page slides out from under the child's finger mid-letter.
      */}
      <svg
        ref={svgRef}
        viewBox={frame.viewBox}
        role="img"
        aria-label={t("activity.trace.label", { glyph: definition.glyph })}
        className="h-full w-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
              className="stroke-muted-foreground/70"
              strokeWidth={unit(GUIDE_WIDTH)}
              strokeDasharray={`${unit(GUIDE_DOT)} ${unit(GUIDE_GAP)}`}
            />
          )}

          {strokes.slice(0, strokeIndex).map((stroke) => (
            <path
              key={stroke.id}
              d={stroke.d}
              data-testid="trace-ink"
              className="stroke-secondary"
              strokeWidth={inkWidth}
            />
          ))}

          {coveredPoints.length < 2 ? null : (
            <polyline
              data-testid="trace-progress"
              points={toPolyline(coveredPoints)}
              className="stroke-secondary"
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
              r={unit(START_DOT_RADIUS)}
              className="origin-center fill-accent/40 motion-safe:animate-ping"
              style={{ transformBox: "fill-box" }}
            />
            <circle
              cx={startPoint.x}
              cy={startPoint.y}
              r={unit(START_DOT_RADIUS)}
              className="fill-accent"
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
                className="fill-primary/70"
                transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle}) scale(${frame.unit})`}
              />
            ))}
      </svg>
    </div>
  );
}
