"use client";

import { useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

const RESET_AFTER_MS = 2000;

export function useCopyToClipboard(): {
  copyState: CopyState;
  copy: (text: string) => Promise<void>;
} {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(text: string): Promise<void> {
    window.clearTimeout(timer.current);
    try {
      // Undefined outside a secure context, e.g. a staging host over plain http.
      if (navigator.clipboard === undefined) throw new Error("No clipboard");
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    timer.current = window.setTimeout(
      () => setCopyState("idle"),
      RESET_AFTER_MS,
    );
  }

  return { copyState, copy };
}

export const COPY_FAILED_LABEL = "Copy failed — select the text";
