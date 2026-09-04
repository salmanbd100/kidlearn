import type { WorldSummaryResponse } from "@kidlearn/types";
import type { CSSProperties } from "react";

/**
 * World theming, from the row that describes the world (FR-WORLD-05, FR-STORY-04).
 */

/**
 * The gradient a world paints itself with, or `undefined` when the row carries no
 * usable colours — in which case the caller keeps the theme's own card surface
 * rather than rendering a broken `linear-gradient(...)` string.
 */
export function worldGradientStyle(
  palette: WorldSummaryResponse["palette"],
): CSSProperties | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;

  const to = typeof palette.secondary === "string" ? palette.secondary : from;
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}
