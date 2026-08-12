"use client";

import type { ClientRect, DragEndEvent } from "@dnd-kit/core";
import type { DragDropActivity } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateDrop, isActivityComplete, type PlacedItems } from "./evaluate";
import type { ActivityFeedback } from "./use-activity-feedback";

/**
 * Everything that happens between a child letting go and the activity being over.
 *
 * Extracted from the renderer because jsdom cannot perform a drag: dnd-kit hands
 * the component a `DragEndEvent` and nothing below cares where it came from, so
 * the rules — what a wrong drop does, when the activity is finished — are
 * testable by calling `handleDragEnd` directly. The renderer keeps the markup.
 */

export const WIGGLE_MS = 400;

/**
 * Which item is wiggling, and how many times it has been asked to.
 *
 * The counter is load-bearing. A child who drops the cow in the pond twice is
 * the single most likely thing to happen in this activity, and `itemId` alone
 * would not change between those two attempts — so the state would not update,
 * the class would stay applied without interruption, and the second wrong drop
 * would produce no wiggle at all. The renderer keys the animated element on the
 * count so the animation restarts from the beginning every time.
 */
export interface WiggleRequest {
  itemId: string;
  count: number;
}

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
  const [wiggle, setWiggle] = useState<WiggleRequest | undefined>(undefined);

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
      setWiggle((current) => ({ itemId, count: (current?.count ?? 0) + 1 }));
    },
    [definition, feedback],
  );

  useEffect(() => {
    if (wiggle === undefined) return;
    const timer = window.setTimeout(
      () => setWiggle(undefined),
      // Cleared on a timer rather than on `animationend`: the reduced-motion
      // reset in globals.css collapses the keyframes to 0.01ms, and a listener
      // would then unset the state before the browser had painted anything.
      WIGGLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wiggle]);

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
