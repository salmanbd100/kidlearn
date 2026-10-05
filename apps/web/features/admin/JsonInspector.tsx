"use client";

import { Button, cn } from "@kidlearn/ui";
import { useState } from "react";

export interface JsonInspectorProps {
  title: string;
  value: unknown;
  className?: string;
}

export function JsonInspector({ title, value, className }: JsonInspectorProps) {
  const [isCopied, setIsCopied] = useState(false);

  const text = stringify(value);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the text is selectable either way.
    }
  }

  return (
    <details
      className={cn(
        "rounded-(--radius) border border-border bg-card",
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-(--radius) px-3 font-medium text-foreground text-sm",
          "focus-ring",
        )}
      >
        {title}
        <span className="text-muted-foreground text-xs">{byteLabel(text)}</span>
      </summary>

      <div className="flex flex-col gap-2 border-border border-t p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => void handleCopy()}
        >
          {isCopied ? "Copied" : "Copy JSON"}
        </Button>
        {/* Scroll the block, not the page, on a long prompt line. */}
        <pre className="max-h-96 overflow-auto rounded-(--radius) bg-muted p-3 font-mono text-muted-foreground text-xs leading-relaxed">
          {text}
        </pre>
      </div>
    </details>
  );
}

/** `JSON.stringify` can throw on circular input; say so rather than blank the review screen. */
function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return "This record could not be displayed as JSON.";
  }
}

function byteLabel(text: string): string {
  const kilobytes = text.length / 1024;
  return kilobytes < 1 ? `${text.length} chars` : `${Math.round(kilobytes)} KB`;
}
