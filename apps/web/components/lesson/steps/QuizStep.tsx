"use client";

import { useTranslation } from "react-i18next";
import { ActivityUnavailable } from "@/components/activities/ActivityUnavailable";
import { QuizEngine } from "@/components/quiz/QuizEngine";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";
import type { LessonStepProps } from "./lesson-step-props";

/**
 * The quiz (FR-LSN-04, FR-QUIZ-01..08).
 *
 * Thin, like the activity step: everything about *asking* a question belongs to
 * the engine, which validates its own payloads. This file answers the one thing
 * the engine cannot — which lesson is on screen, and whether it has a quiz at
 * all. A `null` quiz is an ordinary authoring state (a published lesson may
 * point at a quiz still in review), so it gets the same gentle way onward a
 * child gets from a broken payload.
 *
 * **The locale is the child's, not `lesson.locale`** — see `ActivityStep` for
 * why. Question payloads carry both languages and have nothing to fall back from.
 *
 * File 22 replaces `onFinish` with the submission: the records the engine hands
 * over are posted from here, and the score screen comes back before the step
 * completes. Scoring stays server-authoritative, so nothing about it travels up
 * through the player.
 */
export function QuizStep({ lesson, onComplete }: LessonStepProps) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const locale = toLocale(i18n.resolvedLanguage);

  return (
    <section data-step="quiz" className="flex flex-1 flex-col">
      {lesson.quiz === null ? (
        <ActivityUnavailable message={t("quiz.empty")} onSkip={onComplete} />
      ) : (
        <QuizEngine
          quizId={lesson.quiz.id}
          questions={lesson.quiz.questions}
          locale={locale}
          // The answers are dropped on the floor until file 22 posts them.
          onFinish={onComplete}
        />
      )}
    </section>
  );
}
