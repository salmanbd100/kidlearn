"use client";

import type { Locale } from "@kidlearn/types";
import confetti from "canvas-confetti";
import { type RefObject, useCallback, useMemo, useRef } from "react";
import { useAudio } from "@/components/AudioProvider";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";

// The two things every activity says back to a child (FR-ACT-05).

export interface ActivityFeedback {
  /** Cheer + confetti. `anchor` is a viewport point — where the child just touched. */
  success: (anchor?: { x: number; y: number }) => void;
  /** Encouragement only; the caller owns the wiggle, which belongs to its own markup. */
  retry: () => void;
}

const FEEDBACK_AUDIO_DIR = "/audio/feedback";

/**
 * Three of each, so the same voice line does not come back on every attempt —
 * a child who hears one clip six times stops hearing it. Cheers are wordless and
 * shared across locales; encouragement is spoken, so it is per-locale.
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

/**
 * The two pools, drawn from. Exported because the quiz engine (file 21) speaks
 * the same two lines from its own feedback channel: a child who has just heard
 * this cheer for placing a card must hear it again for answering a question, or
 * the app has two vocabularies for "yes, that's it".
 */
export function randomCheerAudioUrl(): string {
  return cheerAudioUrl(pick(CHEER_COUNT));
}

export function randomRetryAudioUrl(locale: Locale): string {
  return retryAudioUrl(locale, pick(RETRY_COUNT));
}

/** Spoken on the screen shown when a payload cannot be rendered at all. */
export function oopsAudioUrl(locale: Locale): string {
  return `${FEEDBACK_AUDIO_DIR}/oops-${locale}.mp3`;
}

export interface ActivityFeedbackChannel {
  feedback: ActivityFeedback;
  /** Attach to `<FeedbackLayer>` — the surface the confetti is drawn on. */
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

      // Bound to our own canvas rather than the library's global one, so the
      // burst is inside the pointer-events-none overlay and cannot outlive the
      // step by leaving a stray element on <body>.
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
          // A device without OffscreenCanvas support is a device with no confetti.
          // The cheer already told the child they were right.
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
