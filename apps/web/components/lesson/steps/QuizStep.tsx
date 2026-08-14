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

/**
 * The quiz (FR-LSN-04, FR-QUIZ-01..08).
 *
 * Thin, like the activity step: everything about *asking* a question belongs to
 * the engine, which validates its own payloads. This file answers the two things
 * the engine cannot — which lesson is on screen, and what happens to the answers
 * once the last one is in. A `null` quiz is an ordinary authoring state (a
 * published lesson may point at a quiz still in review), so it gets the same
 * gentle way onward a child gets from a broken payload.
 *
 * **The submission never gets in the child's way.** The score screen is rendered
 * from the records the engine just handed over, and the POST is fired alongside
 * it rather than awaited: a failure is a lost row in a report an adult reads
 * later, and there is no version of that worth stranding a four-year-old on a
 * spinner for. Scoring itself stays server-authoritative — nothing the response
 * carries is shown to the child, and nothing about it travels up through the
 * player.
 *
 * **The locale is the child's, not `lesson.locale`** — see `ActivityStep` for
 * why. Question payloads carry both languages and have nothing to fall back from.
 */
export function QuizStep({ lesson, onComplete }: LessonStepProps) {
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

      void submitQuizResponses(quizId, records).then((result) => {
        if (!result.ok) {
          console.warn(
            `[kidlearn] quiz responses not recorded: ${result.error.code}`,
          );
        }
      });
    },
    [quizId, onComplete],
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
