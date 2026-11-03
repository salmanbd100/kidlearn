"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Restores focus when what the child last touched has gone, so assistive-tech users don't restart from `<body>`.
 * Only when focus was dropped; effects run child-first so the innermost target wins. Needs `tabIndex={-1}`.
 * A control disabled under focus counts as dropped: Firefox and Safari leave focus on it, stranding the keyboard.
 */

const NEVER = Symbol("never");

export function useFocusWhenDropped<T extends HTMLElement>(
  key: unknown,
  // For one of many siblings — list rows — where every row taking focus on arrival would strand it on the last.
  { skipArrival = false }: { skipArrival?: boolean } = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const previous = useRef<unknown>(NEVER);

  useEffect(() => {
    // Compared by hand rather than left to the dependency array, so a remount
    // under Strict Mode's double effect does not count as a second change.
    if (Object.is(previous.current, key)) return;
    const isArrival = previous.current === NEVER;
    previous.current = key;
    if (isArrival && skipArrival) return;

    const active = document.activeElement;
    const isDropped =
      active === null ||
      active === document.body ||
      active.matches(":disabled");
    if (!isDropped) return;
    ref.current?.focus({ preventScroll: true });
  }, [key, skipArrival]);

  return ref;
}
