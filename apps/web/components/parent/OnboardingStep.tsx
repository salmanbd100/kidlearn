"use client";

import { cn } from "@kidlearn/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";

/**
 * Chrome shared by the three first-run steps (FR-AUTH-03..04, FR-PROF-01).
 *
 * The point is the progress line. A mandatory flow with no visible end is the
 * shape a parent abandons; "Step 2 of 3" is what says the PIN pad is not the
 * beginning of an unbounded form.
 *
 * There is no back link, on purpose. Consent and the PIN are recorded server-side
 * as each step completes, so a step behind the current one has nothing left to
 * change — `resolveParentRedirect` would send a parent forward again immediately.
 */

export const ONBOARDING_STEP_COUNT = 3;

/** 1-based, matching the `step` prop, so the segments key on themselves. */
const STEP_NUMBERS = [1, 2, 3] as const;

export interface OnboardingStepProps {
  /** 1-based, matching what the progress line says. */
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}

export function OnboardingStep({
  step,
  title,
  description,
  children,
}: OnboardingStepProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-6">
      <div className="flex flex-col gap-3">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.05em]">
          {t("onboarding.stepOf", {
            current: step,
            total: ONBOARDING_STEP_COUNT,
          })}
        </p>
        {/* Decorative: the line above already states the position in words, so a
            screen reader is not made to count segments. */}
        <div aria-hidden="true" className="flex gap-1.5">
          {STEP_NUMBERS.map((number) => (
            <span
              // The step number, not the array index: the segments are three fixed
              // steps, so the number is their identity.
              key={number}
              className={cn(
                "h-1.5 flex-1 rounded-pill",
                number <= step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
        <h1 className="font-semibold text-2xl text-foreground">{title}</h1>
        {description !== undefined ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </main>
  );
}
