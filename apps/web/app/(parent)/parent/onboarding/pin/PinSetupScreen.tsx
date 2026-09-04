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

/** Step two: choose the parental PIN (FR-AUTH-04). */
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
