"use client";

import { useTranslation } from "react-i18next";
import { ActivityEngine } from "@/features/activities/ActivityEngine";
import { ActivityUnavailable } from "@/features/activities/ActivityUnavailable";
import { LESSON_NAMESPACE } from "@/shared/lib/i18n";
import { toLocale } from "@/shared/lib/locale";
import type { LessonStepProps } from "./lesson-step-props";

/** The interactive activity (FR-LSN-03). */
export function ActivityStep({ lesson, onComplete }: LessonStepProps) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const locale = toLocale(i18n.resolvedLanguage);

  return (
    <section data-step="activity" className="flex flex-1 flex-col">
      {lesson.activity === null ? (
        <ActivityUnavailable
          message={t("activity.empty")}
          onSkip={onComplete}
        />
      ) : (
        <ActivityEngine
          definition={lesson.activity.definition}
          locale={locale}
          onComplete={onComplete}
        />
      )}
    </section>
  );
}
