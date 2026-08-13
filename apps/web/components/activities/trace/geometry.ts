import { svgPathProperties } from "svg-path-properties";

/**
 * Everything the tracing activity needs to know about an SVG path, computed in
 * pure JavaScript (FR-ACT-02).
 *
 * **`svg-path-properties` rather than the DOM.** `SVGPathElement.getPointAtLength`
 * is the obvious tool and jsdom does not implement it, which would put the one
 * part of this activity that decides whether a child was right beyond the reach
 * of a unit test. This library does the same arithmetic off-DOM, so every
 * function here runs under plain Vitest.
 *
 * **The glyph's coordinate space belongs to the payload, not to this file.** A
 * trace payload's `pathData` may be authored in any range — the canonical "A"
 * fixture uses 0–200 — so nothing here assumes one. `glyphFrameOf` derives the
 * viewBox from the path's own extent and reports the scale factor that converts
 * the reference lengths the renderer and `tolerance` are written in (a 0–100
 * space) into that payload's units. Without it, a glyph authored at twice the
 * reference size would be traced with half the intended forgiveness and drawn
 * with half the intended stroke weight.
 */

export interface Point {
  x: number;
  y: number;
}

/** The coordinate space `tolerance` and every stroke width below are written in. */
export const REFERENCE_EXTENT = 100;

/** Breathing room around the glyph, in reference units, so thick ink never clips. */
const FRAME_PADDING = 9;

export interface GlyphFrame {
  /** Ready for the `viewBox` attribute. */
  viewBox: string;
  /** Multiply a reference-space length by this to get the payload's own units. */
  unit: number;
}

export interface PathArrow extends Point {
  /** Degrees clockwise from the positive x-axis — ready for an SVG `rotate()`. */
  angle: number;
  /** Position along the stroke, so the renderer has a key that is not a render-time index. */
  order: number;
}

/** SVG numbers: optional sign, optional leading dot, optional exponent. */
const NUMBER_PATTERN = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

/** A relative moveto and the whole run of numbers belonging to it. */
const RELATIVE_MOVETO_PATTERN =
  /^m[\s,]*(?:[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?[\s,]*)+/;

/** The library exports the constructor only — its instance type has no name to import. */
type PathProperties = InstanceType<typeof svgPathProperties>;

function properties(pathData: string): PathProperties | undefined {
  try {
    return new svgPathProperties(pathData);
  } catch {
    // A payload can carry any string, and the renderer's job when it carries a
    // broken one is to draw nothing rather than to take the lesson down with it.
    return undefined;
  }
}

function endPointOf(pathData: string): Point | undefined {
  const path = properties(pathData);
  if (path === undefined) return undefined;
  const total = path.getTotalLength();
  return Number.isFinite(total) ? path.getPointAtLength(total) : undefined;
}

/**
 * Rewrite a subpath's opening `m dx dy` as the absolute point it resolves to.
 *
 * Prepending an absolute moveto instead would look simpler and be wrong:
 * `getPointAtLength(0)` reports a path's *initial* point, so a stroke opening
 * with two movetos samples its first point at the wrong end and the child is
 * asked to start somewhere the ink never goes.
 *
 * A multi-pair `m` carries implicit **relative** linetos after the moveto, which
 * an absolute `M` would silently turn into absolute ones — hence the explicit
 * `l` for whatever follows the first pair.
 */
function toAbsoluteMoveTo(chunk: string, cursor: Point): string {
  const match = RELATIVE_MOVETO_PATTERN.exec(chunk);
  if (match === null) return chunk;

  const numbers = match[0].match(NUMBER_PATTERN)?.map(Number) ?? [];
  if (numbers.length < 2) return chunk;

  const [dx = 0, dy = 0, ...trailing] = numbers;
  const pairs = trailing.slice(0, trailing.length - (trailing.length % 2));
  const implicitLine = pairs.length > 0 ? ` l ${pairs.join(" ")}` : "";

  return `M ${cursor.x + dx} ${cursor.y + dy}${implicitLine}${chunk.slice(
    match[0].length,
  )}`;
}

/**
 * Split on every moveto, resolving relative ones.
 *
 * A subpath opening with a relative `m` is positioned against wherever the
 * previous subpath left off, so lifting it out on its own would move it —
 * measurably, for any glyph whose author wrote `m` instead of `M`.
 */
function resolveSubpaths(pathData: string): string[] {
  const chunks = pathData
    .split(/(?=[Mm])/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("M") || chunk.startsWith("m"));

  const resolved: string[] = [];
  let cursor: Point | undefined;

  for (const chunk of chunks) {
    const absolute =
      chunk.startsWith("m") && cursor !== undefined
        ? toAbsoluteMoveTo(chunk, cursor)
        : chunk;
    resolved.push(absolute);
    cursor = endPointOf(absolute);
  }

  return resolved;
}

/**
 * `strokeOrder` is only honoured when it is a permutation of the strokes that
 * actually exist. A payload whose order drops, repeats or invents a stroke would
 * otherwise leave part of the glyph untraceable and the child unable to finish,
 * so document order — always complete — wins instead (FR-ACT-05).
 */
function isPermutationOf(order: readonly number[], count: number): boolean {
  if (order.length !== count) return false;
  return new Set(order).size === count && order.every((index) => index < count);
}

export function splitStrokes(
  pathData: string,
  strokeOrder?: readonly number[],
): string[] {
  const subpaths = resolveSubpaths(pathData);
  if (
    strokeOrder === undefined ||
    !isPermutationOf(strokeOrder, subpaths.length)
  ) {
    return subpaths;
  }
  return strokeOrder.map((index) => subpaths[index] ?? "");
}

/** `n` points from the stroke's start to its end inclusive, evenly spaced by length. */
export function samplePath(pathData: string, n: number): Point[] {
  if (n < 2) return [];

  const path = properties(pathData);
  if (path === undefined) return [];

  const total = path.getTotalLength();
  if (!Number.isFinite(total)) return [];

  const step = total / (n - 1);
  return Array.from({ length: n }, (_, index) =>
    path.getPointAtLength(index * step),
  );
}

export function glyphFrameOf(points: readonly Point[]): GlyphFrame {
  if (points.length === 0) {
    return {
      viewBox: `0 0 ${REFERENCE_EXTENT} ${REFERENCE_EXTENT}`,
      unit: 1,
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;

  // A glyph is scaled by its longer side, so an "l" is not blown up to the width
  // of an "m". A single-point glyph has no extent to scale by and falls back to
  // the reference one, which keeps the padding below non-zero.
  const extent = Math.max(spanX, spanY) || REFERENCE_EXTENT;
  const unit = extent / REFERENCE_EXTENT;
  const padding = FRAME_PADDING * unit;

  return {
    viewBox: `${minX - padding} ${minY - padding} ${spanX + padding * 2} ${
      spanY + padding * 2
    }`,
    unit,
  };
}

/** Convert a reference-space (0–100) length into the glyph's own units. */
export function toPathUnits(length: number, frame: GlyphFrame): number {
  return length * frame.unit;
}

/**
 * Direction hints along a stroke, spaced so neither the start dot nor the end of
 * the stroke has an arrow sitting on top of it.
 */
export function arrowsAlong(pathData: string, count: number): PathArrow[] {
  if (count < 1) return [];

  const path = properties(pathData);
  if (path === undefined) return [];

  const total = path.getTotalLength();
  if (!Number.isFinite(total) || total === 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const at = (total * (index + 1)) / (count + 1);
    const { x, y } = path.getPointAtLength(at);
    const tangent = path.getTangentAtLength(at);
    return {
      x,
      y,
      angle: (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI,
      order: index,
    };
  });
}
