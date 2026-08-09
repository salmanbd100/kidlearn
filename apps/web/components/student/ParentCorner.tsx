"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PIN_LENGTH, PinPad } from "@/components/parent/PinPad";
import { PARENT_NAMESPACE, STUDENT_NAMESPACE } from "@/lib/i18n";
import { fetchGateStatus, verifyPin } from "@/lib/parent-api";
import { pinErrorKey } from "@/lib/parent-errors";

/** Where the parent area opens once the gate is passed. */
const PARENT_DESTINATION = "/parent/children";

/**
 * The only way out of the Student Portal (Pillar C, FR-AUTH-04).
 *
 * **Placed in a top corner on purpose.** Every other kid control lives in the
 * thumb zone; this one is deliberately outside it (design.md §6), because the
 * design goal is the opposite of the rest of the surface — a grown-up should find
 * it, a child sweeping their thumb across the screen should not.
 *
 * **The PIN is answered here, not after navigating.** Pushing to `/parent/*` and
 * letting `ParentGuard` raise its gate would work, but it would render the parent
 * dashboard behind the modal for anyone who taps the lock — a child included.
 * Verifying first means the student surface is what stays on screen until the PIN
 * is right, and a wrong PIN goes nowhere at all.
 *
 * The grant itself is still the server's: `verifyPin` opens the same 15-minute
 * session window the parent dashboard reads back from `gate-status`, so arriving
 * there needs no client-side state to be handed over.
 */
export function ParentCorner() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleOpen = async () => {
    if (isBusy) return;
    setIsBusy(true);
    const gate = await fetchGateStatus();
    setIsBusy(false);

    // No PIN set, or one already verified in this session: there is nothing to
    // ask. A parent who has not finished onboarding is sent to the right step by
    // `ParentGuard` once they arrive, which is the one place that decision lives.
    if (gate.ok && (!gate.data.hasPin || gate.data.isPinVerified)) {
      router.push(PARENT_DESTINATION);
      return;
    }

    // A failed gate-status check still raises the pad rather than opening the
    // door: failing closed is the only safe direction for a parental gate.
    setPin("");
    setError(null);
    setIsPromptOpen(true);
  };

  const handleChange = async (next: string) => {
    if (isBusy) return;

    setPin(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;

    setIsBusy(true);
    const result = await verifyPin(next);
    setIsBusy(false);

    if (result.ok) {
      router.push(PARENT_DESTINATION);
      return;
    }

    setPin("");
    // The PIN vocabulary is the parent surface's, and stays there: a wrong
    // PIN is a message for the grown-up holding the tablet.
    setError(t(pinErrorKey(result.error), { ns: PARENT_NAMESPACE }));
  };

  return (
    <>
      <button
        type="button"
        // Small and quiet by design, but still a legal target for the adult hand
        // that needs it (44px, design.md §7 — this is a parent control).
        className="absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-pill text-muted-foreground transition-colors [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={t("parentCorner.label")}
        onClick={() => {
          void handleOpen();
        }}
      >
        <Lock aria-hidden="true" className="size-5" />
      </button>

      {/* Dismissable, unlike `PinGate`: that one guards a page already on
          screen, this one guards a door nobody has walked through yet, and a
          child who tapped the lock by accident must be able to get back to
          playing. */}
      <Dialog
        open={isPromptOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setIsPromptOpen(false);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader gutter="flush">
            <DialogTitle>{t("parentCorner.title")}</DialogTitle>
            <DialogDescription>{t("parentCorner.intro")}</DialogDescription>
          </DialogHeader>
          <PinPad
            value={pin}
            onChange={(next) => {
              void handleChange(next);
            }}
            isDisabled={isBusy}
            error={error}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
