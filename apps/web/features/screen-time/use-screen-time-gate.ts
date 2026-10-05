"use client";

import type { ScreenTimeBlockCode } from "@kidlearn/types";
import { useCallback, useEffect, useState } from "react";
import { getScreenTimeStatus } from "./screen-time-api";

/**
 * A hint, not the gate: the server answers `423` regardless. A failed status read counts as "not blocked";
 * failing closed would lock out a child on a merely slow connection.
 */

export type ScreenTimeGate = {
  block: ScreenTimeBlockCode | null | undefined;
  windowStart: string | null;
  /** Re-checks, then runs `start` only if the child may; blocked children get the lock screen instead. */
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
      // A failed read is not a block: the server still enforces on the fetch.
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
