"use client";

import type { ClientRect, DragEndEvent } from "@dnd-kit/core";
import type { PuzzleActivity } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  evaluatePiecePlacement,
  isPuzzleComplete,
  puzzleSlotId,
} from "./evaluate";
import type { ActivityFeedback } from "./use-activity-feedback";
import { useWiggle, type WiggleRequest } from "./use-wiggle";

/**
 * Which pieces are in, and what happens when one is let go (FR-ACT-04).
 *
 * Extracted from the renderer for the same reason `usePlacementState` is: jsdom
 * cannot perform a drag, so the rules a child is marked against are testable by
 * calling `handleDragEnd` with a `DragEndEvent` nothing here can tell from a real
 * one. The renderer keeps the board.
 */

/**
 * How long the finished picture holds before the engine takes over to celebrate.
 *
 * `--dur-slow`, which design.md §5.2 sets as the ceiling for a celebration — and
 * this is one, however brief. The same rule is why `skipShine` exists: a child
 * already reaching for the next thing must not be held by it.
 */
export const SHINE_MS = 400;

export interface PuzzleState {
  /** Slot indexes holding a piece, including whatever `prePlaced` started with. */
  filled: ReadonlySet<number>;
  isComplete: boolean;
  wiggle: WiggleRequest | undefined;
  handleDragEnd: (event: DragEndEvent) => void;
  /** Ends the shine early. A no-op until the picture is actually finished. */
  skipShine: () => void;
}

function centreOf(rect: ClientRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function usePuzzleState(
  definition: PuzzleActivity,
  feedback: ActivityFeedback,
  onActivityComplete: () => void,
): PuzzleState {
  const [filled, setFilled] = useState<ReadonlySet<number>>(
    // Lazily, and from the payload: `prePlaced` is how a Nursery puzzle starts
    // part-built, and the schema guarantees it never covers the whole board.
    () => new Set(definition.prePlaced ?? []),
  );
  const [isComplete, setIsComplete] = useState(false);
  const { wiggle, requestWiggle } = useWiggle();

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // Let go over nothing: dnd-kit drops the transform and the piece is already
      // back in the tray. The child has not answered yet, so nothing is said.
      if (over === null) return;

      const pieceId = String(active.id);
      const slotId = String(over.id);
      const slot = definition.slots.find(
        (candidate) => puzzleSlotId(candidate.index) === slotId,
      );
      if (slot === undefined) return;

      if (!evaluatePiecePlacement(definition, pieceId, slotId)) {
        feedback.retry();
        requestWiggle([pieceId]);
        return;
      }

      feedback.success(centreOf(over.rect));
      const next = new Set(filled).add(slot.index);
      setFilled(next);
      if (isPuzzleComplete(definition, next)) setIsComplete(true);
    },
    [definition, feedback, filled, requestWiggle],
  );

  // The picture gets a beat to be looked at whole before the engine's celebration
  // covers it. Reported once however the beat ends — the timer or a tap — because
  // a second call would advance the lesson two steps.
  const hasReported = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const reportComplete = useCallback(() => {
    if (hasReported.current) return;
    hasReported.current = true;
    window.clearTimeout(timerRef.current);
    onActivityComplete();
  }, [onActivityComplete]);

  // Scheduled once and deliberately without a cleanup: clearing on every re-run
  // would cancel the pending hold each time `onActivityComplete` changed identity
  // and the step would never advance. Unmount clears it below.
  const hasScheduled = useRef(false);
  useEffect(() => {
    if (!isComplete || hasScheduled.current) return;
    hasScheduled.current = true;
    timerRef.current = window.setTimeout(reportComplete, SHINE_MS);
  }, [isComplete, reportComplete]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const skipShine = useCallback(() => {
    if (isComplete) reportComplete();
  }, [isComplete, reportComplete]);

  return { filled, isComplete, wiggle, handleDragEnd, skipShine };
}
