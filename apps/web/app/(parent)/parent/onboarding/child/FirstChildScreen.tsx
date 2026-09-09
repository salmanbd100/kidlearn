"use client";

import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildProfileForm } from "@/components/parent/ChildProfileForm";
import { OnboardingStep } from "@/components/parent/OnboardingStep";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { createChild } from "@/lib/parent-api";

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
