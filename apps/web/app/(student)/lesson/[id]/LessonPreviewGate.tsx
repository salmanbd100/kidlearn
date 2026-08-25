"use client";

import type { Locale } from "@kidlearn/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { fetchAdminMe } from "@/lib/admin-api";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { StudentGuard, StudentStatus } from "../../StudentGuard";

/**
 * Who `?preview=1` actually gets the preview (file 33, FR-CMS-04).
 *
 * **The parameter requests the mode; `/api/admin/me` grants it.** Preview mode
 * suppresses every write the player makes — no heartbeat, no step report, no
 * session event, no completion, no quiz submission — and a mode that suppresses
 * recording must not be reachable by typing six characters into a URL. Deciding
 * it from `searchParams` alone let anyone on a signed-in family tablet play
 * published lessons that never accrue against the parental daily limit
 * (FR-TIME-02..04) and never reach the parent dashboard, which is precisely the
 * client-side switch `enforce-screen-time.ts` exists to rule out.
 *
 * So the answer comes from the server: `/api/admin/me` is behind `requireAdmin`,
 * and a parent gets `403` there. Anyone it refuses falls through to the ordinary
 * guarded player, which records exactly as it does without the parameter.
 *
 * `StudentGuard` is skipped only on the confirmed-admin branch, and only because
 * an admin has no child profile and never will — the guard would bounce them to
 * `/select-profile` before the player mounted. It is not skipped for anybody the
 * server has not vouched for.
 */
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
