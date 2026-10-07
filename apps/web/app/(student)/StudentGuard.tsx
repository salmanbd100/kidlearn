"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";

export function StudentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { status, parent, child, isWakingUp, refresh } = useActiveChild();

  // Consent before the profile picker: the API refuses every progress write until the current text is accepted.
  const redirectTo =
    status === "signedOut"
      ? PARENT_ROUTES.signInPage
      : status === "ready" && parent?.hasCurrentConsent === false
        ? PARENT_ROUTES.consent
        : status === "ready" && child === undefined
          ? STUDENT_ROUTES.selectProfile
          : undefined;

  useEffect(() => {
    if (redirectTo !== undefined) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (status === "error") {
    return (
      <StudentStatus tone="alert" onRetry={() => void refresh()}>
        {t("status.error")}
      </StudentStatus>
    );
  }

  if (status === "loading" || redirectTo !== undefined) {
    return (
      <StudentStatus tone="status">
        {isWakingUp ? t("status.waking") : t("selectProfile.loading")}
      </StudentStatus>
    );
  }

  return <>{children}</>;
}
