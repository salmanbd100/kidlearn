import { svgPathProperties } from "svg-path-properties";

export interface Point {
  x: number;
  y: number;
}

export const REFERENCE_EXTENT = 100;

const FRAME_PADDING = 9;

export interface GlyphFrame {
  viewBox: string;
  unit: number;
}

export interface PathArrow extends Point {
  angle: number;
  order: number;
}

const NUMBER_PATTERN = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

const RELATIVE_MOVETO_PATTERN =
  /^m[\s,]*(?:[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?[\s,]*)+/;

/** The library exports the constructor only; its instance type has no importable name. */
type PathProperties = InstanceType<typeof svgPathProperties>;

function properties(pathData: string): PathProperties | undefined {
  try {
    return new svgPathProperties(pathData);
  } catch {
    // A broken payload draws nothing rather than taking the lesson down.
    return undefined;
  }
}

function endPointOf(pathData: string): Point | undefined {
  const path = properties(pathData);
  if (path === undefined) return undefined;
  const total = path.getTotalLength();
  return Number.isFinite(total) ? path.getPointAtLength(total) : undefined;
}

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
 * `strokeOrder` is honoured only when it is a permutation of the existing strokes; otherwise a
 * dropped or invented stroke would make the glyph untraceable, so document order wins (FR-ACT-05).
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

  // Scaled by the longer side so an "l" is not blown up to an "m"'s width; a single point falls
  // back to the reference extent, keeping padding non-zero.
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

export function toPathUnits(length: number, frame: GlyphFrame): number {
  return length * frame.unit;
}

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
