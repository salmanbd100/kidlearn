"use client";

import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
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
 *
 * `POST /api/children` is PIN-gated on the server, and the grant normally arrives
 * from the previous screen (`setParentPin` opens it). `guard` covers the case where
 * it did not survive the trip — a slept tab, a drifted clock — by showing the PIN
 * pad rather than an error a parent cannot act on.
 */
export function FirstChildScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { refresh } = useParentSession();
  const { guard } = useParentGate();

  return (
    <OnboardingStep
      step={3}
      title={t("form.firstChildTitle")}
      description={t("form.firstChildIntro")}
    >
      <ChildProfileForm
        onSubmit={(values) => guard(createChild(values))}
        onSaved={() => {
          void refresh();
        }}
        submitLabel={t("form.create")}
      />
    </OnboardingStep>
  );
}
