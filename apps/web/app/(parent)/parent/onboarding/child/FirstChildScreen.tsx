"use client";

import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildProfileForm } from "@/features/children/ChildProfileForm";
import { OnboardingStep } from "@/features/parent/OnboardingStep";
import { createChild } from "@/features/parent/parent-api";
import { PARENT_NAMESPACE } from "@/shared/lib/i18n";

/** Step three: the first child profile (FR-PROF-01..02). */
export function FirstChildScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();

  return (
    <OnboardingStep
      step={2}
      title={t("form.firstChildTitle")}
      description={t("form.firstChildIntro")}
    >
      <ChildProfileForm
        onSubmit={(values) => createChild(values)}
        onSaved={() => {
          void refresh();
        }}
        submitLabel={t("form.create")}
      />
    </OnboardingStep>
  );
}
