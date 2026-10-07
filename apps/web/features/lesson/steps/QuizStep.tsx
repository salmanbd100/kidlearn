"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type { QuizResponseRecord } from "@kidlearn/types";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityUnavailable } from "@/features/activities/ActivityUnavailable";
import { QuizEngine } from "@/features/quiz/QuizEngine";
import { QuizScoreScreen } from "@/features/quiz/QuizScoreScreen";
import type { QuizAnswerRecord } from "@/features/quiz/types";
import { submitQuizResponses } from "@/shared/api/progress-api";
import type { LessonStepProps } from "./lesson-step-props";

export function QuizStep({
  lesson,
  onComplete,
  isPreview,
  pendingWrites,
  locale,
}: LessonStepProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const [finishedRecords, setFinishedRecords] = useState<
    readonly QuizAnswerRecord[] | undefined
  >(undefined);

  const quizId = lesson.quiz?.id;

  const handleFinish = useCallback(
    (records: readonly QuizAnswerRecord[]) => {
      // Every question was unrenderable: congratulating the child for a quiz they never saw is
      // worse than moving on quietly.
      if (records.length === 0 || quizId === undefined) {
        onComplete();
        return;
      }

      setFinishedRecords(records);

      // Admin preview scores on screen and records nothing: no child owns a `QuizResponse`, and the
      // endpoint refuses an admin session.
      if (isPreview) return;

      // `isFirstAttemptCorrect` is dropped: the server derives it from `attempts` (`backend.md
      // §8`). The two derivations must agree, via the shared `evaluateAnswer`.
      const wire: QuizResponseRecord[] = records.map(
        ({ questionId, answer, attempts }) => ({
          questionId,
          answer,
          attempts,
        }),
      );

      const submit = () =>
        submitQuizResponses(quizId, wire).then((result) => {
          if (!result.ok) {
            console.warn(
              `[kidlearn] quiz responses not recorded: ${result.error.code}`,
            );
          }
        });
      if (pendingWrites === undefined) void submit();
      else pendingWrites.add(submit);
    },
    [quizId, onComplete, isPreview, pendingWrites],
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
