"use client";

import type { Locale } from "@kidlearn/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { fetchAdminMe } from "@/lib/admin-api";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { StudentGuard, StudentStatus } from "../../StudentGuard";

/** Who `?preview=1` actually gets the preview (file 33, FR-CMS-04). */
export function LessonPreviewGate({
  lessonId,
  previewLanguage,
}: {
  lessonId: string;
  previewLanguage: Locale;
}) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const [isAdmin, setIsAdmin] = useState<boolean>();

  useEffect(() => {
    let isCurrent = true;
    void fetchAdminMe().then((result) => {
      if (isCurrent) setIsAdmin(result.ok);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  // Nothing renders until the answer lands. Starting the player in either mode
  // and switching would either record a step the preview should not have
  // recorded, or drop one the child is owed.
  if (isAdmin === undefined) {
    return <StudentStatus tone="status">{t("loading")}</StudentStatus>;
  }

  if (isAdmin) {
    return (
      <LessonPlayer
        lessonId={lessonId}
        isPreview
        previewLanguage={previewLanguage}
      />
    );
  }

  return (
    <StudentGuard>
      <LessonPlayer lessonId={lessonId} />
    </StudentGuard>
  );
}
