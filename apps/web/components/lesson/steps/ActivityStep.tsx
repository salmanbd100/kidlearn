"use client";

import { useTranslation } from "react-i18next";
import { ActivityEngine } from "@/components/activities/ActivityEngine";
import { ActivityUnavailable } from "@/components/activities/ActivityUnavailable";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";
import type { LessonStepProps } from "./lesson-step-props";

/**
 * The interactive activity (FR-LSN-03).
 *
 * Thin by design: everything about *playing* an activity belongs to the engine,
 * which is handed the raw payload and validates it itself. This file's whole job
 * is to answer the one question the engine cannot — which lesson is on screen,
 * and does it have an activity at all.
 *
 * `activity` being `null` is an ordinary authoring state, not a failure: a
 * published lesson may point at an activity still in review, in which case the
 * API omits it. The child gets the same gentle way onward they would get from a
 * broken payload, because to them the two are the same thing.
 *
 * **The locale handed to the engine is the child's, not `lesson.locale`.** Those
 * are different things: `lesson.locale` reports which language supplied the
 * lesson's *text*, and it falls back to English when the Bangla translation of a
 * title has not been written yet. An activity payload is required to carry both
 * languages (`LocalizedText`, `LocalizedAudio`), so it has nothing to fall back
 * from — passing `lesson.locale` would speak English instructions to a Bangla
 * child over an untranslated lesson, with the Bangla recording sitting unused in
 * the very payload being rendered.
 */
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
