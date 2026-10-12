"use client";

import { Button } from "@kidlearn/ui";
import { Check, Copy } from "lucide-react";
import {
  COPY_FAILED_LABEL,
  useCopyToClipboard,
} from "@/features/admin/use-copy-to-clipboard";

export function CopyBlock({ label, text }: { label: string; text: string }) {
  const { copyState, copy } = useCopyToClipboard();

  return (
    <figure className="flex flex-col overflow-hidden rounded-(--radius) border border-border bg-card">
      <figcaption className="flex min-h-11 items-center justify-between gap-2 border-border border-b px-3">
        <span className="font-medium text-foreground text-xs">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => void copy(text)}
        >
          {copyState === "copied" ? (
            <Check aria-hidden="true" className="size-4!" />
          ) : (
            <Copy aria-hidden="true" className="size-4!" />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? COPY_FAILED_LABEL
              : "Copy"}
        </Button>
      </figcaption>
      <pre className="overflow-x-auto bg-muted p-3 font-mono text-muted-foreground text-xs leading-relaxed">
        {text}
      </pre>
    </figure>
  );
}
