"use client";

import { evaluateAnswer } from "@kidlearn/types";
import { useCallback, useState } from "react";
import type { PlayableQuestion, QuestionProps } from "./types";

export interface OptionChoice {
  chosenId: string | undefined;
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
      // Locked while the last tap's feedback plays: makes a double-tap on the right answer
      // harmless.
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
