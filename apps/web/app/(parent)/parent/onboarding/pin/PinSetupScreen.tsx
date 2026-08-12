"use client";

import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { OnboardingStep } from "@/components/parent/OnboardingStep";
import { PinSetup } from "@/components/parent/PinSetup";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { setPin } from "@/lib/parent-api";

/**
 * Step two: choose the parental PIN (FR-AUTH-04).
 *
 * `refresh()` on success rather than a router push: `hasPin` flipping is what
 * `resolveParentRedirect` uses to move the parent on to the first profile, so
 * re-reading the session both records the step and performs the navigation. One
 * source of truth for "has a PIN", and it is the server's.
 *
 * The grant the write returns is handed straight to `unlock`. The next screen
 * creates a profile, and `POST /api/children` is PIN-gated on the server — so a
 * client that dropped this expiry would put the PIN pad in front of a parent one
 * screen after they chose the PIN, which reads as a bug and is one.
 */
export function PinSetupScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();
  const { unlock } = useParentGate();

  return (
    <OnboardingStep
      step={2}
      title={t("pin.setupTitle")}
      description={t("pin.setupIntro")}
    >
      <PinSetup
        onSubmit={async (pin) => {
          const result = await setPin(pin);
          if (result.ok) unlock(result.data.pinVerifiedUntil);
          return result;
        }}
        onComplete={() => {
          void refresh();
        }}
      />
    </OnboardingStep>
  );
}
