"use client";

import { useCallback, useEffect, useState } from "react";

// The shake that says "not quite — have another go" (FR-ACT-05).

export const WIGGLE_MS = 400;

/**
 * How long a request lives — longer than the shake, because the static
 * have-another-go mark rides on it, and with reduced motion that mark is the
 * only thing a child who cannot hear the encouragement sees (design.md §2.3).
 */
export const NOT_QUITE_MS = 1200;

/**
 * Which elements are shaking, and how many times a shake has been asked for.
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
      NOT_QUITE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wiggle]);

  return { wiggle, requestWiggle };
}
