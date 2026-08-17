import type { WorldSummaryResponse } from "@kidlearn/types";
import type { CSSProperties } from "react";

/**
 * World theming, from the row that describes the world (FR-WORLD-05, FR-STORY-04).
 *
 * Extracted from `WorldCard` when the story library needed the same accent on its
 * covers: a story is set in a world and carries that world's row, so the two
 * surfaces theme themselves from one function rather than each growing its own
 * `if (slug === "jungle")`.
 *
 * Deviation from the implementation spec, which asked for a
 * `WORLD_ACCENTS: Record<World, …>` map keyed by a `jungle | ocean | space` union.
 * A hard-coded map would undo the property file 15 established and tests for —
 * adding Space World must be a database row, not a code change — so the accent is
 * read from `palette` instead.
 */

/**
 * The gradient a world paints itself with, or `undefined` when the row carries no
 * usable colours — in which case the caller keeps the theme's own card surface
 * rather than rendering a broken `linear-gradient(...)` string.
 *
 * `palette` is free-form JSONB (`{ primary, secondary, bg }` in the seed), so the
 * two keys are read defensively: a world saved with only `primary` still renders.
 */
export function worldGradientStyle(
  palette: WorldSummaryResponse["palette"],
): CSSProperties | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;

  const to = typeof palette.secondary === "string" ? palette.secondary : from;
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}
