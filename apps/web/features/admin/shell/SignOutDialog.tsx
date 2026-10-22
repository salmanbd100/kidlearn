"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";

export interface SignOutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isBusy: boolean;
  hasFailed: boolean;
  onConfirm: () => void;
}

export function SignOutDialog({
  isOpen,
  onOpenChange,
  isBusy,
  hasFailed,
  onConfirm,
}: SignOutDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="Close">
        <DialogHeader gutter="inset">
          <DialogTitle>Sign out?</DialogTitle>
          <DialogDescription>
            Anything you have not saved on this page will be lost.
          </DialogDescription>
        </DialogHeader>

        {hasFailed ? (
          <p className="text-destructive text-sm" role="alert">
            Could not sign out. Check your connection and try again.
          </p>
        ) : null}

        <DialogFooter className="border-border border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            isLoading={isBusy}
            onClick={onConfirm}
          >
            Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
