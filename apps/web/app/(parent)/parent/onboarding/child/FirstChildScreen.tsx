"use client";

import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { ChildProfileForm } from "@/components/parent/ChildProfileForm";
import { OnboardingStep } from "@/components/parent/OnboardingStep";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { createChild } from "@/lib/parent-api";

/**
 * Step three: the first child profile (FR-PROF-01..02).
 *
 * Creating it is what completes onboarding — `resolveParentRedirect` keeps sending
 * a consented, PIN-holding parent with zero profiles back here, and stops the
 * moment the count is one. So `refresh()` is both the record and the navigation,
 * and there is no "skip": a parent with no child has nothing to open the Student
 * Portal with.
 *
 * The same form as `/parent/children/new`, with no cancel link — there is nowhere
 * to go back to during a mandatory step.
 */
export function FirstChildScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();

  return (
    <OnboardingStep
      step={3}
      title={t("form.firstChildTitle")}
      description={t("form.firstChildIntro")}
    >
      <ChildProfileForm
        onSubmit={createChild}
        onSaved={() => {
          void refresh();
        }}
        submitLabel={t("form.create")}
      />
    </OnboardingStep>
  );
}
