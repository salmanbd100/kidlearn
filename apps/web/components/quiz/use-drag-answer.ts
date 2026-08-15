"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { DragAnswerQuestion } from "@kidlearn/types";
import { useCallback, useState } from "react";
import { evaluateAnswer } from "./evaluate-answer";
import type { QuestionProps } from "./types";

/**
 * Everything that happens between a child letting go and the sentence being
 * finished (FR-QUIZ-03).
 *
 * Extracted from the renderer for the reason `activities/use-placement-state.ts`
 * is: jsdom has no layout, so it has no collision detection and no sensor run —
 * dnd-kit hands the component a `DragEndEvent` and nothing below cares where it
 * came from. The rules are therefore driven by calling `handleDragEnd` directly.
 *
 * The tap rules are the pick-one formats' rules with a drag in front of them: a
 * wrong option steps aside and stops answering, the others stay live, nothing
 * counts down and nothing runs out (§5.7).
 */

/** The droppable the blank in the sentence registers as. */
export const BLANK_DROPPABLE_ID = "blank";

export interface DragAnswerState {
  /** The option sitting in the blank, once the right one has been dropped in. */
  lockedId: string | undefined;
  /** Options already tried and set aside. */
  dimmedIds: ReadonlySet<string>;
  handleDragEnd: (event: DragEndEvent) => void;
}

export function useDragAnswer({
  definition,
  feedback,
  onAttempt,
  onCommit,
}: Pick<
  QuestionProps<DragAnswerQuestion>,
  "definition" | "feedback" | "onAttempt" | "onCommit"
>): DragAnswerState {
  const [lockedId, setLockedId] = useState<string | undefined>(undefined);
  const [dimmedIds, setDimmedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const { isLocked, correct, retry } = feedback;

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // Let go over nothing, or over anything that is not the blank: dnd-kit has
      // already dropped the transform and the card is back in the tray. Silence
      // is right — the child has not answered yet, so there is nothing to
      // encourage them about.
      if (over === null || String(over.id) !== BLANK_DROPPABLE_ID) return;

      const optionId = String(active.id);
      // Locked covers both holds: the cheer after the right answer, and the beat
      // after a wrong one. A card released during either is a drag that started
      // before the feedback did.
      if (isLocked || lockedId !== undefined || dimmedIds.has(optionId)) return;

      const isCorrect = evaluateAnswer(definition, optionId);
      onAttempt(optionId, isCorrect);

      if (isCorrect) {
        setLockedId(optionId);
        correct(() => onCommit(optionId));
        return;
      }

      retry();
      setDimmedIds((current) => new Set(current).add(optionId));
    },
    [
      definition,
      isLocked,
      lockedId,
      dimmedIds,
      correct,
      retry,
      onAttempt,
      onCommit,
    ],
  );

  return { lockedId, dimmedIds, handleDragEnd };
}

/**
 * The sentence either side of its `{blank}`.
 *
 * The schema guarantees exactly one token per locale, so the split always yields
 * two halves — but a payload is JSONB written by an author or an AI pipeline and
 * validated in a different process, so a missing token degrades to "all of it
 * before the blank" rather than rendering `undefined` at a child.
 */
export function splitAtBlank(sentence: string): {
  before: string;
  after: string;
} {
  const [before, after = ""] = sentence.split("{blank}");
  return { before, after };
}
