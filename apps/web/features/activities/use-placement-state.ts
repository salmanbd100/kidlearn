"use client";

import type { ClientRect, DragEndEvent } from "@dnd-kit/core";
import type { DragDropActivity } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWiggle, type WiggleRequest } from "@/shared/hooks/use-wiggle";
import { evaluateDrop, isActivityComplete, type PlacedItems } from "./evaluate";
import type { ActivityFeedback } from "./use-activity-feedback";

export interface PlacementState {
  placed: PlacedItems;
  wiggle: WiggleRequest | undefined;
  handleDragEnd: (event: DragEndEvent) => void;
  place: (
    itemId: string,
    targetId: string,
    anchor?: { x: number; y: number },
  ) => void;
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

  const place = useCallback(
    (itemId: string, targetId: string, anchor?: { x: number; y: number }) => {
      if (evaluateDrop(definition, itemId, targetId)) {
        feedback.success(anchor);
        setPlaced((current) => ({ ...current, [itemId]: targetId }));
        return;
      }

      feedback.retry();
      requestWiggle([itemId]);
    },
    [definition, feedback, requestWiggle],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // Let go over nothing: the card is already back in the tray, and the child has not answered
      // yet.
      if (over === null) return;
      place(String(active.id), String(over.id), centreOf(over.rect));
    },
    [place],
  );

  // Once only: the effect re-runs on every placement and a second call would advance two steps.
  const hasReportedComplete = useRef(false);
  useEffect(() => {
    if (hasReportedComplete.current) return;
    if (!isActivityComplete(definition, placed)) return;
    hasReportedComplete.current = true;
    onActivityComplete();
  }, [definition, placed, onActivityComplete]);

  return { placed, wiggle, handleDragEnd, place };
}
