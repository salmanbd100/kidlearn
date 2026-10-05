"use client";

import { useCallback, useEffect, useState } from "react";

export const WIGGLE_MS = 400;

/**
 * Outlives the shake: the static have-another-go mark rides on it and, under reduced motion, is all
 * a child who cannot hear sees (design.md §2.3).
 */
export const NOT_QUITE_MS = 1200;

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
      // Cleared on a timer, not `animationend`: the reduced-motion reset collapses keyframes to
      // 0.01ms and a listener would unset state before paint.
      NOT_QUITE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wiggle]);

  return { wiggle, requestWiggle };
}
