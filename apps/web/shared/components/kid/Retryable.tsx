"use client";

import { type ReactNode, useCallback, useState } from "react";

/**
 * Remounts its children when `retry` is called, so a screen that loads in an
 * effect starts over from `loading` without tracking an attempt counter itself.
 */
export function Retryable({
  children,
}: {
  children: (retry: () => void) => ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return (
    <div key={attempt} className="contents">
      {children(retry)}
    </div>
  );
}
