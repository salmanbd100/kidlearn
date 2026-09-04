"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@kidlearn/ui";
import { type FormEvent, useEffect, useState } from "react";

/**
 * Refusing a generation, with the reason the server insists on (file 37,
 * FR-AI-08).
 */

/** The server's `z.string().trim().min(10)`, mirrored so the button can wait. */
const MIN_REASON_LENGTH = 10;

export interface RejectDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being refused, named in the copy — "The letter A". */
  subject: string;
  isBusy: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
}

export function RejectDialog({
  isOpen,
  onOpenChange,
  subject,
  isBusy,
  error,
  onConfirm,
}: RejectDialogProps) {
  const [reason, setReason] = useState("");

  // Cleared on close rather than on open, so a rejection the server refused can
  // be corrected instead of retyped.
  useEffect(() => {
    if (!isOpen) setReason("");
  }, [isOpen]);

  const trimmed = reason.trim();
  const remaining = MIN_REASON_LENGTH - trimmed.length;
  const canSubmit = remaining <= 0 && !isBusy;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onConfirm(trimmed);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Close">
        <DialogHeader gutter="inset">
          <DialogTitle>Reject “{subject}”?</DialogTitle>
          <DialogDescription>
            The generated content stays in the database at{" "}
            <strong>rejected</strong> and is never shown to a child. Nothing is
            deleted — the prompt and the model’s answer are kept so this can be
            regenerated properly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">What was wrong with it?</Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={reason}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              placeholder="The Bangla script reads as a translation rather than as speech."
            />
            <p
              className="text-muted-foreground text-xs"
              // Announced as it changes, so the reason a disabled button is
              // disabled reaches a screen-reader user too (design.md §2.3).
              aria-live="polite"
            >
              {remaining > 0
                ? `${remaining} more character${remaining === 1 ? "" : "s"} — this is what tells whoever regenerates it what to change.`
                : "Stored on the job for good."}
            </p>
          </div>

          {error === undefined ? null : (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit}>
              {isBusy ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
