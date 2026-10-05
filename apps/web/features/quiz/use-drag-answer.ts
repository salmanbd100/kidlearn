"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import { type DragAnswerQuestion, evaluateAnswer } from "@kidlearn/types";
import { useCallback, useState } from "react";
import type { QuestionProps } from "./types";

export const BLANK_DROPPABLE_ID = "blank";

export interface DragAnswerState {
  lockedId: string | undefined;
  dimmedIds: ReadonlySet<string>;
  handleDragEnd: (event: DragEndEvent) => void;
  place: (optionId: string, targetId: string) => void;
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

  const place = useCallback(
    (optionId: string, targetId: string) => {
      // Anything but the blank: the card is back in the tray, and the child has not answered yet.
      if (targetId !== BLANK_DROPPABLE_ID) return;

      // Locked covers the post-right cheer and the post-wrong beat; a card placed during either was
      // picked up before feedback began.
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

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over === null) return;
      place(String(active.id), String(over.id));
    },
    [place],
  );

  return { lockedId, dimmedIds, handleDragEnd, place };
}

export function splitAtBlank(sentence: string): {
  before: string;
  after: string;
} {
  const [before, after = ""] = sentence.split("{blank}");
  return { before, after };
}
