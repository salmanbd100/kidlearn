"use client";

import type { ClientRect, DragEndEvent } from "@dnd-kit/core";
import type { DragDropActivity } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateDrop, isActivityComplete, type PlacedItems } from "./evaluate";
import type { ActivityFeedback } from "./use-activity-feedback";
import { useWiggle, type WiggleRequest } from "./use-wiggle";

/**
 * Everything that happens between a child letting go and the activity being over.
 */

export interface PlacementState {
  placed: PlacedItems;
  wiggle: WiggleRequest | undefined;
  handleDragEnd: (event: DragEndEvent) => void;
}

function centreOf(rect: ClientRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function usePlacementState(
  definition: DragDropActivity,
  feedback: ActivityFeedback,
  onActivityComplete: () => void,
): PlacementState {
  const [placed, setPlaced] = useState<PlacedItems>({});
  const { wiggle, requestWiggle } = useWiggle();

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // Let go over nothing: dnd-kit drops the transform and the card is already
      // back in the tray. Silence is right — the child has not answered yet.
      if (over === null) return;

      const itemId = String(active.id);
      const targetId = String(over.id);

      if (evaluateDrop(definition, itemId, targetId)) {
        feedback.success(centreOf(over.rect));
        setPlaced((current) => ({ ...current, [itemId]: targetId }));
        return;
      }

      feedback.retry();
      requestWiggle([itemId]);
    },
    [definition, feedback, requestWiggle],
  );

  // Once, and only once. The effect re-runs on every placement, and a second
  // call would advance the lesson two steps.
  const hasReportedComplete = useRef(false);
  useEffect(() => {
    if (hasReportedComplete.current) return;
    if (!isActivityComplete(definition, placed)) return;
    hasReportedComplete.current = true;
    onActivityComplete();
  }, [definition, placed, onActivityComplete]);

  return { placed, wiggle, handleDragEnd };
}
