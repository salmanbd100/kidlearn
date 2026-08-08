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

/**
 * The blocking PIN prompt (FR-AUTH-04).
 *
 * Rendered by `ParentGuard` whenever the gate is shut on a non-exempt route, so
 * this component's only job is the prompt itself. Two decisions worth stating:
 *
 *  - **`isDismissable={false}`.** No close button, and Escape and outside clicks
 *    are ignored. A gate that can be dismissed is not a gate, and a child who can
 *    tap past it defeats the whole feature. Focus is still trapped and still
 *    returns on close, because Radix handles that regardless.
 *  - **Nothing is stored client-side on success.** The grant is the server's
 *    session row (file 10). The client is told only when it lapses, and
 *    `unlock()` hands that expiry to the provider so the gate can shut itself
 *    again on time.
 *
 * The page underneath stays mounted, so a parent who was halfway through a form
 * when the grant lapsed does not lose it.
 */
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
