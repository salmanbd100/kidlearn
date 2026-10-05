import type { WorldSummaryResponse } from "@kidlearn/types";
import type { CSSProperties } from "react";

/** The world's gradient, or `undefined` when the row has no usable colours, so the caller keeps the card surface instead of a broken string. */
export function worldGradientStyle(
  palette: WorldSummaryResponse["palette"],
): CSSProperties | undefined {
  const from = palette.primary;
  if (typeof from !== "string" || from.length === 0) return undefined;

  const to = typeof palette.secondary === "string" ? palette.secondary : from;
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}
