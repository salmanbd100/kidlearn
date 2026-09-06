"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Lock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ParentAvatar } from "@/components/ParentAvatar";
import { PIN_LENGTH, PinPad } from "@/components/parent/PinPad";
import { useActiveChild } from "@/lib/active-child";
import { PARENT_NAMESPACE, STUDENT_NAMESPACE } from "@/lib/i18n";
import { fetchGateStatus, verifyPin } from "@/lib/parent-api";
import { pinErrorKey } from "@/lib/parent-errors";
import { STUDENT_ROUTES } from "@/lib/student-routes";

/** Where the parent area opens once the gate is passed. */
const PARENT_DESTINATION = "/parent/children";

const parentCornerVariants = cva(
  // Small and quiet by design, but still a legal target for the adult hand that
  // needs it (44px, design.md §7 — this is a parent control).
  "absolute top-2 right-2 z-10 inline-flex h-11 items-center rounded-pill text-muted-foreground transition-colors [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      appearance: {
        chip: "max-w-[45vw] gap-2 bg-card pr-4 pl-1.5 shadow-sm",
        lock: "w-11 justify-center",
      },
    },
    defaultVariants: { appearance: "lock" },
  },
);

/** The only way out of the Student Portal (Pillar C, FR-AUTH-04). */
export function ParentCorner() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { parent } = useActiveChild();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  /**
   * Named on the hand-off screen, anonymous everywhere else. `/select-profile`
   * is the one place no child is playing yet, so a grown-up looking for the way
   * out can be shown it; on a screen a child is *using*, a photo of their parent
   * is the most tappable thing on the page, and FR-AUTH-04 wants that exit dull.
   */
  const isNamed =
    pathname === STUDENT_ROUTES.selectProfile && parent !== undefined;

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
        className={parentCornerVariants({
          appearance: isNamed ? "chip" : "lock",
        })}
        aria-label={t("parentCorner.label")}
        onClick={() => {
          void handleOpen();
        }}
      >
        {isNamed && parent !== undefined ? (
          <>
            <ParentAvatar parent={parent} size="sm" />
            {/* Truncated rather than wrapped: the chip must stay one 44px row,
                and a long Google display name would otherwise push the layout. */}
            <span className="truncate font-body text-base">
              {parent.name ?? t("parentCorner.chipFallback")}
            </span>
          </>
        ) : (
          <Lock aria-hidden="true" className="size-5" />
        )}
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
