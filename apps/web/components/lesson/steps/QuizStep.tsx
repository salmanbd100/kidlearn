"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityUnavailable } from "@/components/activities/ActivityUnavailable";
import { QuizEngine } from "@/components/quiz/QuizEngine";
import { QuizScoreScreen } from "@/components/quiz/QuizScoreScreen";
import type { QuizAnswerRecord } from "@/components/quiz/types";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";
import { submitQuizResponses } from "@/lib/progress-api";
import type { LessonStepProps } from "./lesson-step-props";

/** The quiz (FR-LSN-04, FR-QUIZ-01..08). */
export function QuizStep({ lesson, onComplete, isPreview }: LessonStepProps) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const locale = toLocale(i18n.resolvedLanguage);
  const [finishedRecords, setFinishedRecords] = useState<
    readonly QuizAnswerRecord[] | undefined
  >(undefined);

  const quizId = lesson.quiz?.id;

  const handleFinish = useCallback(
    (records: readonly QuizAnswerRecord[]) => {
      // Every question was unrenderable, so the engine finished before the child
      // answered anything. A screen of no stars congratulating them for a quiz
      // they never saw is worse than moving on quietly.
      if (records.length === 0 || quizId === undefined) {
        onComplete();
        return;
      }

      setFinishedRecords(records);

      // An administrator preview scores on screen and records nothing
      // (file 33, FR-CMS-04). There is no child for a `QuizResponse` row to
      // belong to, and the endpoint would refuse an admin session anyway.
      if (isPreview) return;

      void submitQuizResponses(quizId, records).then((result) => {
        if (!result.ok) {
          console.warn(
            `[kidlearn] quiz responses not recorded: ${result.error.code}`,
          );
        }
      });
    },
    [quizId, onComplete, isPreview],
  );

  return (
    <section data-step="quiz" className="flex flex-1 flex-col">
      {lesson.quiz === null ? (
        <ActivityUnavailable message={t("quiz.empty")} onSkip={onComplete} />
      ) : finishedRecords !== undefined ? (
        <QuizScoreScreen records={finishedRecords} onDone={onComplete} />
      ) : (
        <QuizEngine
          quizId={lesson.quiz.id}
          questions={lesson.quiz.questions}
          locale={locale}
          onFinish={handleFinish}
        />
      )}
    </section>
  );
}
