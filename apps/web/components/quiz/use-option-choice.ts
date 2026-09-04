"use client";

import { useCallback, useState } from "react";
import { evaluateAnswer } from "./evaluate-answer";
import type { PlayableQuestion, QuestionProps } from "./types";

// Tap one, and that is your answer (FR-QUIZ-01, FR-QUIZ-04).

export interface OptionChoice {
  /** The option that was right, once it has been tapped. */
  chosenId: string | undefined;
  /** Options already tried and set aside. */
  triedIds: ReadonlySet<string>;
  choose: (optionId: string) => void;
}

export function useOptionChoice({
  definition,
  feedback,
  onAttempt,
  onCommit,
}: Pick<
  QuestionProps<PlayableQuestion>,
  "definition" | "feedback" | "onAttempt" | "onCommit"
>): OptionChoice {
  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const [triedIds, setTriedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const { isLocked, correct, retry } = feedback;

  const choose = useCallback(
    (optionId: string) => {
      // Locked means the feedback for the last tap is still playing. Ignoring
      // taps here is what makes a double-tap on the right answer harmless — the
      // second one would otherwise land on the next question.
      if (isLocked || triedIds.has(optionId)) return;

      const isCorrect = evaluateAnswer(definition, optionId);
      onAttempt(optionId, isCorrect);

      if (isCorrect) {
        setChosenId(optionId);
        correct(() => onCommit(optionId));
        return;
      }

      retry();
      setTriedIds((current) => new Set(current).add(optionId));
    },
    [definition, isLocked, triedIds, correct, retry, onAttempt, onCommit],
  );

  return { chosenId, triedIds, choose };
}
