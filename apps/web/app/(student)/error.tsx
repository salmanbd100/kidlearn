"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StudentStatus } from "@/shared/components/kid/StudentStatus";

/** Sits inside the student layout so the kid theme and parent corner survive; a child is never left on a blank page. */
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
