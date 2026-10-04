"use client";

import { Button } from "@kidlearn/ui";
import { useEffect } from "react";

/**
 * A render-time throw inside a CMS screen. Sits inside the admin shell, so the
 * rail survives and the reviewer can move to another section.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[kidlearn] admin screen render failed", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-start gap-4 p-6">
      <p role="alert" className="text-destructive text-sm">
        This screen failed to render. The error is in the browser console.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
