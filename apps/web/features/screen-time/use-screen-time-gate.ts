"use client";

import type { ScreenTimeBlockCode } from "@kidlearn/types";
import { useCallback, useEffect, useState } from "react";
import { getScreenTimeStatus } from "./screen-time-api";

/**
 * The student surface's view of the screen-time gate (FR-TIME-02, FR-TIME-04).
 */

export type ScreenTimeGate = {
  /** `undefined` while the first check is in flight, `null` when allowed. */
  block: ScreenTimeBlockCode | null | undefined;
  /** `"HH:MM"` when a window is set — what the lock screen names. */
  windowStart: string | null;
  /**
   * Re-checks, then runs `start` only if the child may. Blocked children get the
   * lock screen instead, and never the navigation.
   */
  guardStart: (start: () => void) => Promise<void>;
};

export function useScreenTimeGate(): ScreenTimeGate {
  const [block, setBlock] = useState<ScreenTimeBlockCode | null | undefined>(
    undefined,
  );
  const [windowStart, setWindowStart] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    void getScreenTimeStatus().then((result) => {
      if (!isCurrent) return;
      // A failed read is not a block — see the file header.
      setBlock(result.ok ? result.data.reason : null);
      if (result.ok) setWindowStart(result.data.windowStart);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const guardStart = useCallback(async (start: () => void) => {
    const result = await getScreenTimeStatus();
    if (result.ok && !result.data.allowed) {
      setBlock(result.data.reason);
      setWindowStart(result.data.windowStart);
      return;
    }
    setBlock(null);
    start();
  }, []);

  return { block, windowStart, guardStart };
}
