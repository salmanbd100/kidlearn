"use client";

import type { ActivityDefinition, Locale } from "@kidlearn/types";
import type { ReactNode } from "react";
import { DragDropActivity } from "./DragDropActivity";
import { MatchActivity } from "./MatchActivity";
import { PuzzleActivity } from "./PuzzleActivity";
import { TraceActivity } from "./TraceActivity";
import type { ActivityFeedback } from "./use-activity-feedback";

/**
 * Activity type → renderer (FR-ACT-06, NFR-SCALE-02).
 *
 * **Every renderer is handed the same four props**, which is what makes a new
 * activity type a new file plus one `case` rather than a change to the engine:
 * the definition it was validated into, the child's locale, the shared feedback
 * channel, and one callback to say it is finished.
 *
 * A `switch` rather than the `Record<type, Component>` lookup this reads like it
 * wants to be. A lookup returns the union of all four component types, whose
 * props collapse to an impossible intersection (`DragDropActivity &
 * TraceActivity`), so dispatching through it needs an `as` cast on the one line
 * where the discriminant is the only thing keeping the app correct. The switch
 * narrows `definition` for free and the compiler checks exhaustiveness — add a
 * fifth activity type to the union and this stops compiling until it is handled.
 */

export interface ActivityRendererProps<
  T extends ActivityDefinition = ActivityDefinition,
> {
  definition: T;
  locale: Locale;
  feedback: ActivityFeedback;
  /** Renderer → engine. The engine celebrates, then reports the step complete. */
  onActivityComplete: () => void;
}

export function renderActivity({
  definition,
  ...rest
}: ActivityRendererProps): ReactNode {
  switch (definition.type) {
    case "drag_drop":
      return <DragDropActivity definition={definition} {...rest} />;
    case "trace":
      return <TraceActivity definition={definition} {...rest} />;
    case "match":
      return <MatchActivity definition={definition} {...rest} />;
    case "puzzle":
      return <PuzzleActivity definition={definition} {...rest} />;
  }
}
