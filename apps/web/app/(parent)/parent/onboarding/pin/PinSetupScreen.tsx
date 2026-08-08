"use client";

import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
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
 */
export function PinSetupScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();

  return (
    <OnboardingStep
      step={2}
      title={t("pin.setupTitle")}
      description={t("pin.setupIntro")}
    >
      <PinSetup
        onSubmit={setPin}
        onComplete={() => {
          void refresh();
        }}
      />
    </OnboardingStep>
  );
}
