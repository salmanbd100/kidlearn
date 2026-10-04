"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";
import { STUDENT_NAMESPACE } from "@/shared/lib/i18n";

/**
 * A render-time throw inside a student screen. Sits inside the student layout,
 * so the kid theme and the parent corner survive it — a child is never left on
 * a blank page with nothing to tap.
 */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation(STUDENT_NAMESPACE);

  useEffect(() => {
    console.error("[kidlearn] student screen render failed", error);
  }, [error]);

  return (
    <StudentStatus tone="alert" onRetry={reset}>
      {t("status.error")}
    </StudentStatus>
  );
}
