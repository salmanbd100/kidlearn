"use client";

import { useEffect, useRef } from "react";

/**
 * Puts focus back somewhere sensible when what the child last touched has gone
 * — the answered question, the finished lesson step, the back arrow on page one.
 * Without it focus falls to `<body>`, and a screen reader or switch user starts
 * again from the top of the document on every transition.
 *
 * Only when focus was dropped: moving it away from a control that is still on
 * screen (the story's "next" arrow) would make a keyboard user hunt for it again
 * on every page. Effects run child-first, so when two of these change on the same
 * render the innermost target wins — a new quiz step lands on the question, not
 * on the step's name.
 *
 * Attach the ref to an element with `tabIndex={-1}`.
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
