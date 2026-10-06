"use client";

import type { ClientRect, DragEndEvent } from "@dnd-kit/core";
import type { PuzzleActivity } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWiggle, type WiggleRequest } from "@/shared/hooks/use-wiggle";
import {
  evaluatePiecePlacement,
  isPuzzleComplete,
  puzzleSlotId,
} from "./evaluate";
import type { ActivityFeedback } from "./use-activity-feedback";

export const SHINE_MS = 400;

export interface PuzzleState {
  filled: ReadonlySet<number>;
  isComplete: boolean;
  wiggle: WiggleRequest | undefined;
  handleDragEnd: (event: DragEndEvent) => void;
  place: (
    pieceId: string,
    slotId: string,
    anchor?: { x: number; y: number },
  ) => void;
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
    // Lazily from the payload: `prePlaced` starts a Nursery puzzle part-built and never covers the
    // whole board.
    () => new Set(definition.prePlaced ?? []),
  );
  const [isComplete, setIsComplete] = useState(false);
  const { wiggle, requestWiggle } = useWiggle();

  const place = useCallback(
    (pieceId: string, slotId: string, anchor?: { x: number; y: number }) => {
      const slot = definition.slots.find(
        (candidate) => puzzleSlotId(candidate.index) === slotId,
      );
      if (slot === undefined || filled.has(slot.index)) return;

      if (!evaluatePiecePlacement(definition, pieceId, slotId)) {
        feedback.retry();
        requestWiggle([pieceId]);
        return;
      }

      feedback.success(anchor);
      const next = new Set(filled).add(slot.index);
      setFilled(next);
      if (isPuzzleComplete(definition, next)) setIsComplete(true);
    },
    [definition, feedback, filled, requestWiggle],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // Let go over nothing: the piece is already back in the tray, and the child has not answered
      // yet.
      if (over === null) return;
      place(String(active.id), String(over.id), centreOf(over.rect));
    },
    [place],
  );

  // A beat to look at the whole picture before the celebration. Reported once, whether the timer or
  // a tap ends it.
  const hasReported = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const reportComplete = useCallback(() => {
    if (hasReported.current) return;
    hasReported.current = true;
    window.clearTimeout(timerRef.current);
    onActivityComplete();
  }, [onActivityComplete]);

  // No cleanup on purpose: clearing on every re-run would cancel the hold each time
  // `onActivityComplete` changed identity. Unmount clears it below.
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

  return { filled, isComplete, wiggle, handleDragEnd, place, skipShine };
}
