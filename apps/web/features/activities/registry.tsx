"use client";

import type { ActivityDefinition, Locale } from "@kidlearn/types";
import type { ReactNode } from "react";
import { DragDropActivity } from "./DragDropActivity";
import { MatchActivity } from "./MatchActivity";
import { PuzzleActivity } from "./PuzzleActivity";
import { TraceActivity } from "./TraceActivity";
import type { ActivityFeedback } from "./use-activity-feedback";

export interface ActivityRendererProps<
  T extends ActivityDefinition = ActivityDefinition,
> {
  definition: T;
  locale: Locale;
  feedback: ActivityFeedback;
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
