"use client";

import type { ChildProfileResponse } from "@kidlearn/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@kidlearn/ui";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiResult } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { childWriteErrorKey } from "@/lib/parent-errors";

/**
 * Confirm deleting a profile (FR-PROF-06).
 *
 * The delete button stays disabled until the parent has typed the child's name
 * exactly. That is not friction for its own sake: this erases every star, badge
 * and lesson a child earned, cascading across eight tables, and design.md §1.2 is
 * explicit that nothing destructive may be one easy tap away on a device a
 * four-year-old also holds. Typing a name is something a mis-tap cannot do.
 *
 * The comparison requires the exact name, and trims only surrounding whitespace —
 * a mobile keyboard's trailing space is not a different name, but a different name
 * is.
 */
export interface DeleteChildDialogProps {
  child: ChildProfileResponse;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (id: string) => Promise<ApiResult<{ deleted: true }>>;
  /** Runs after the deletion succeeds. */
  onDeleted: () => void;
}

export function DeleteChildDialog({
  child,
  isOpen,
  onOpenChange,
  onConfirm,
  onDeleted,
}: DeleteChildDialogProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const inputId = useId();
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = typedName.trim() === child.firstName.trim();

  const handleConfirm = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError(null);
    const result = await onConfirm(child.id);
    setIsDeleting(false);

    if (result.ok) {
      onDeleted();
      return;
    }
    setError(t(childWriteErrorKey(result.error)));
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        // Reopening starts from a blank field: a name left in the box from a
        // cancelled attempt would arm the button before the parent read anything.
        if (!next) {
          setTypedName("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" closeLabel={t("delete.close")}>
        <DialogHeader>
          <DialogTitle>
            {t("delete.title", { name: child.firstName })}
          </DialogTitle>
          <DialogDescription>
            {t("delete.warning", { name: child.firstName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>
            {t("delete.prompt", { name: child.firstName })}
          </Label>
          <Input
            id={inputId}
            value={typedName}
            autoComplete="off"
            onChange={(event) => setTypedName(event.target.value)}
          />
        </div>

        {error !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("delete.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isConfirmed || isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {isDeleting ? t("delete.deleting") : t("delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
