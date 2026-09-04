"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { DragAnswerQuestion } from "@kidlearn/types";
import { useCallback, useState } from "react";
import { evaluateAnswer } from "./evaluate-answer";
import type { QuestionProps } from "./types";

/**
 * Everything that happens between a child letting go and the sentence being
 * finished (FR-QUIZ-03).
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

/** The sentence either side of its `{blank}`. */
export function splitAtBlank(sentence: string): {
  before: string;
  after: string;
} {
  const [before, after = ""] = sentence.split("{blank}");
  return { before, after };
}
