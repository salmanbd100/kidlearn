"use client";

import { useCallback, useState } from "react";
import { evaluateAnswer } from "./evaluate-answer";
import type { PlayableQuestion, QuestionProps } from "./types";

/**
 * Tap one, and that is your answer (FR-QUIZ-01, FR-QUIZ-04).
 *
 * **Single tap commits — there is no confirm step.** A three-year-old does not
 * hold an intention across "pick" and "then press OK"; asking them to would turn
 * every question into two questions. So the tap *is* the answer, and the safety
 * net is that a wrong one costs nothing.
 *
 * **A wrong option is set aside, not marked.** It fades and stops answering, the
 * others stay live, and the child tries again with fewer things to consider —
 * which is help, not a penalty. Nothing counts down and nothing runs out (§5.7).
 *
 * Shared by both pick-one formats: the interaction is identical and only the
 * layout differs, so it lives here and the format files hold the shapes.
 */

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
