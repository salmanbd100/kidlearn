"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { STUDENT_NAMESPACE } from "@/shared/lib/i18n";

/** What every student screen that needs a child sits behind. */
export function StudentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { status, child, isWakingUp, refresh } = useActiveChild();

  const redirectTo =
    status === "signedOut"
      ? "/parent/login"
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
