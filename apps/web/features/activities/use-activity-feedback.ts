"use client";

import type { Locale } from "@kidlearn/types";
import { useIsMotionReduced } from "@kidlearn/ui";
import confetti from "canvas-confetti";
import { type RefObject, useCallback, useMemo, useRef } from "react";
import { useAudio } from "@/shared/components/AudioProvider";

export interface ActivityFeedback {
  success: (anchor?: { x: number; y: number }) => void;
  retry: () => void;
}

const FEEDBACK_AUDIO_DIR = "/audio/feedback";

/**
 * Three of each so a clip is not heard six times. Cheers are wordless and shared; encouragement is
 * per-locale.
 */
const CHEER_COUNT = 3;
const RETRY_COUNT = 3;

function pick(count: number): number {
  return 1 + Math.floor(Math.random() * count);
}

export function cheerAudioUrl(variant: number): string {
  return `${FEEDBACK_AUDIO_DIR}/cheer-${variant}.mp3`;
}

export function retryAudioUrl(locale: Locale, variant: number): string {
  return `${FEEDBACK_AUDIO_DIR}/retry-${locale}-${variant}.mp3`;
}

/** Exported so the quiz engine speaks the same two lines: one vocabulary for "yes, that's it". */
export function randomCheerAudioUrl(): string {
  return cheerAudioUrl(pick(CHEER_COUNT));
}

export function randomRetryAudioUrl(locale: Locale): string {
  return retryAudioUrl(locale, pick(RETRY_COUNT));
}

export function oopsAudioUrl(locale: Locale): string {
  return `${FEEDBACK_AUDIO_DIR}/oops-${locale}.mp3`;
}

export interface ActivityFeedbackChannel {
  feedback: ActivityFeedback;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function useActivityFeedback(locale: Locale): ActivityFeedbackChannel {
  const { play } = useAudio();
  const isMotionReduced = useIsMotionReduced();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const burstRef = useRef<confetti.CreateTypes | undefined>(undefined);

  const success = useCallback(
    (anchor?: { x: number; y: number }) => {
      void play(randomCheerAudioUrl(), { interrupt: true });

      const canvas = canvasRef.current;
      if (canvas === null || isMotionReduced) return;

      // Bound to our own canvas, not the library's global one, so the burst cannot leave a stray
      // element on <body>.
      burstRef.current ??= confetti.create(canvas, {
        resize: true,
        useWorker: true,
      });

      burstRef
        .current({
          particleCount: 60,
          spread: 70,
          startVelocity: 28,
          scalar: 0.9,
          disableForReducedMotion: true,
          origin:
            anchor === undefined
              ? { x: 0.5, y: 0.5 }
              : {
                  x: anchor.x / window.innerWidth,
                  y: anchor.y / window.innerHeight,
                },
        })
        ?.catch(() => {
          // No OffscreenCanvas means no confetti; the cheer already told the child they were right.
        });
    },
    [play, isMotionReduced],
  );

  const retry = useCallback(() => {
    void play(randomRetryAudioUrl(locale), { interrupt: true });
  }, [play, locale]);

  const feedback = useMemo<ActivityFeedback>(
    () => ({ success, retry }),
    [success, retry],
  );

  return { feedback, canvasRef };
}
