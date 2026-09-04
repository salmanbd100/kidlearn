"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentGate } from "@/app/(parent)/context/parent-session";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { verifyPin } from "@/lib/parent-api";
import { pinErrorKey } from "@/lib/parent-errors";
import { PIN_LENGTH, PinPad } from "./PinPad";

/** The blocking PIN prompt (FR-AUTH-04). */
export function PinGate() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { unlock } = useParentGate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleChange = async (next: string) => {
    if (isVerifying) return;

    setPin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;

    // Auto-submit on the fourth digit: there is nothing else this screen could be
    // waiting for, and an extra "confirm" tap on a 4-digit PIN is friction only.
    setIsVerifying(true);
    const result = await verifyPin(next);
    setIsVerifying(false);

    if (result.ok) {
      unlock(result.data.pinVerifiedUntil);
      return;
    }

    setPin("");
    setError(t(pinErrorKey(result.error)));
  };

  return (
    <Dialog open>
      <DialogContent isDismissable={false} size="sm">
        <DialogHeader gutter="flush">
          <DialogTitle>{t("pin.gateTitle")}</DialogTitle>
          <DialogDescription>{t("pin.gateIntro")}</DialogDescription>
        </DialogHeader>
        <PinPad
          value={pin}
          onChange={(next) => {
            void handleChange(next);
          }}
          isDisabled={isVerifying}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}
