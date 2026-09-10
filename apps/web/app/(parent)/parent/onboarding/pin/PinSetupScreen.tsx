"use client";

import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { OnboardingStep } from "@/features/parent/OnboardingStep";
import { PinSetup } from "@/features/parent/PinSetup";
import { setPin } from "@/features/parent/parent-api";
import { PARENT_NAMESPACE } from "@/shared/lib/i18n";

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
