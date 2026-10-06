"use client";

import type { Locale } from "@kidlearn/types";
import { useIsMotionReduced } from "@kidlearn/ui";
import confetti from "canvas-confetti";
import { type RefObject, useCallback, useMemo, useRef } from "react";
import { useAudio } from "@/shared/components/AudioProvider";
import {
  randomCheerAudioUrl,
  randomRetryAudioUrl,
} from "@/shared/components/kid/feedback-audio";

export interface ActivityFeedback {
  success: (anchor?: { x: number; y: number }) => void;
  retry: () => void;
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
