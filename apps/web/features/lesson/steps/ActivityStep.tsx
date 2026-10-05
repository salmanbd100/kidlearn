"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { useTranslation } from "react-i18next";
import { ActivityEngine } from "@/features/activities/ActivityEngine";
import { ActivityUnavailable } from "@/features/activities/ActivityUnavailable";
import type { LessonStepProps } from "./lesson-step-props";

/** The interactive activity (FR-LSN-03). */
export function ActivityStep({ lesson, onComplete, locale }: LessonStepProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);

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
