"use client";

import { type ReactNode, useCallback, useState } from "react";

/** Remounts its children on `retry`, so a screen that loads in an effect restarts from `loading`. */
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
