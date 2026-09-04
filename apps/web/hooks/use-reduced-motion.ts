"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useSyncExternalStore } from "react";
import { A11Y_PREF_CLASSES } from "@/lib/a11y-prefs";

/**
 * Whether animation should be suppressed, from either source that can ask for
 * it (design.md §5.2, NFR-A11Y-05):
 */
export function useIsMotionReduced(): boolean {
  const prefersReducedMotion = useReducedMotion();

  const subscribe = useCallback((onStoreChange: () => void) => {
    const observer = new MutationObserver(onStoreChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const hasReducedMotionClass = useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.classList.contains(
        A11Y_PREF_CLASSES.reducedMotion,
      ),
    () => false,
  );

  return prefersReducedMotion === true || hasReducedMotionClass;
}
