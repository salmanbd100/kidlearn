"use client";

import { useIsMotionReduced } from "@kidlearn/ui";
import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * `useIsMotionReduced`, held at `false` until hydration has finished. The server cannot know the
 * preference, so it renders every picture at its animation start; the first client render has to match
 * that or React keeps the server's `opacity:0` for good. Callers key their motion element on the result,
 * so the flip after hydration remounts it settled instead of animating it.
 */
export function useIsMotionReducedAfterHydration(): boolean {
  const isMotionReduced = useIsMotionReduced();
  const isHydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return isHydrated && isMotionReduced;
}
