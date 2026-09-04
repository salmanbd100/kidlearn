"use client";

import type { Locale } from "@kidlearn/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudio } from "@/components/AudioProvider";
import {
  randomCheerAudioUrl,
  randomRetryAudioUrl,
} from "@/components/activities/use-activity-feedback";

/**
 * What the quiz says back to a child, and the pause it says it in (FR-QUIZ-05,
 * §5.7).
 */

/** The beat between the right answer and the next question. */
export const CORRECT_HOLD_MS = 1200;
/** Long enough for the encouragement to be heard, short enough to retry into. */
export const RETRY_HOLD_MS = 600;

export interface QuestionFeedback {
  /** Question components ignore taps while this is true. */
  isLocked: boolean;
  /** Cheer, hold, then `onResolved` — where the engine commits and advances. */
  correct: (onResolved: () => void) => void;
  retry: () => void;
}

export function useQuestionFeedback(locale: Locale): QuestionFeedback {
  const { play } = useAudio();
  const [isLocked, setIsLocked] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const clearHold = useCallback(() => {
    if (timerRef.current === undefined) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  // The timer outlives the question it was started on — the commit it fires is
  // what unmounts that question — so it has to be dropped when the engine goes.
  useEffect(() => clearHold, [clearHold]);

  const hold = useCallback(
    (durationMs: number, onElapsed?: () => void) => {
      clearHold();
      setIsLocked(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        setIsLocked(false);
        onElapsed?.();
      }, durationMs);
    },
    [clearHold],
  );

  const correct = useCallback(
    (onResolved: () => void) => {
      void play(randomCheerAudioUrl(), { interrupt: true });
      hold(CORRECT_HOLD_MS, onResolved);
    },
    [play, hold],
  );

  const retry = useCallback(() => {
    void play(randomRetryAudioUrl(locale), { interrupt: true });
    hold(RETRY_HOLD_MS);
  }, [play, hold, locale]);

  return useMemo(
    () => ({ isLocked, correct, retry }),
    [isLocked, correct, retry],
  );
}
