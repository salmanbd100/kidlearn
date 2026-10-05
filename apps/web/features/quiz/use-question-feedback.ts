"use client";

import type { Locale } from "@kidlearn/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  randomCheerAudioUrl,
  randomRetryAudioUrl,
} from "@/features/activities/use-activity-feedback";
import { useAudio } from "@/shared/components/AudioProvider";

export const CORRECT_HOLD_MS = 1200;
export const RETRY_HOLD_MS = 600;

export interface QuestionFeedback {
  isLocked: boolean;
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

  // The timer outlives its question (the commit it fires unmounts it), so it must be dropped when
  // the engine goes.
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
