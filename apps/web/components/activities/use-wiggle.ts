"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The shake that says "not quite — have another go" (FR-ACT-05).
 *
 * Shared by all three renderers that can be wrong about something: a card
 * dropped on the wrong home, a piece pushed into the wrong slot, a pair of tapped
 * cards that do not go together. One implementation, so the shake is the same
 * length and the same gesture wherever a child meets it.
 */

export const WIGGLE_MS = 400;

/**
 * Which elements are shaking, and how many times a shake has been asked for.
 *
 * **A list, because a wrong answer is not always one element.** A mismatched pair
 * is two cards, and both have to move — one of them shaking alone would read as
 * "that one was the mistake", which is a judgement this app does not make.
 *
 * **The counter is load-bearing.** Getting the *same* thing wrong twice is the
 * single most likely thing to happen in any of these activities, and `ids` alone
 * would not change between those two attempts — so the state would not update,
 * the class would stay applied without interruption, and the second attempt would
 * produce no shake at all. Renderers key the animated element on the count so the
 * keyframes restart from the beginning every time.
 */
export interface WiggleRequest {
  ids: readonly string[];
  count: number;
}

export interface WiggleChannel {
  wiggle: WiggleRequest | undefined;
  requestWiggle: (ids: readonly string[]) => void;
}

export function isWiggling(
  wiggle: WiggleRequest | undefined,
  id: string,
): boolean {
  return wiggle?.ids.includes(id) ?? false;
}

export function useWiggle(): WiggleChannel {
  const [wiggle, setWiggle] = useState<WiggleRequest | undefined>(undefined);

  const requestWiggle = useCallback((ids: readonly string[]) => {
    setWiggle((current) => ({ ids, count: (current?.count ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (wiggle === undefined) return;
    const timer = window.setTimeout(
      () => setWiggle(undefined),
      // Cleared on a timer rather than on `animationend`: the reduced-motion
      // reset in globals.css collapses the keyframes to 0.01ms, and a listener
      // would then unset the state before the browser had painted anything.
      WIGGLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wiggle]);

  return { wiggle, requestWiggle };
}
