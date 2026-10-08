"use client";

import { useEffect, useRef } from "react";

/**
 * Restores focus when what the child last touched has gone, so assistive-tech users don't restart from `<body>`.
 * Only when focus was dropped; effects run child-first so the innermost target wins. Needs `tabIndex={-1}`.
 */

const NEVER = Symbol("never");

export function useFocusWhenDropped<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T>(null);
  const previous = useRef<unknown>(NEVER);

  useEffect(() => {
    // Compared by hand rather than left to the dependency array, so a remount
    // under Strict Mode's double effect does not count as a second change.
    if (Object.is(previous.current, key)) return;
    previous.current = key;

    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    ref.current?.focus({ preventScroll: true });
  }, [key]);

  return ref;
}
