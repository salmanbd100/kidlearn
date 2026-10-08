"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { readQuizQuestion } from "@kidlearn/types";
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { IconControl } from "@/shared/components/kid/IconControl";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";
import { ProgressFruit } from "./ProgressFruit";
import { isPlayableQuestion, renderQuestion } from "./registry";
import type {
  PlayableQuestion,
  QuizAnswerValue,
  QuizEngineProps,
} from "./types";
import { useQuestionFeedback } from "./use-question-feedback";
import { useQuizSession } from "./use-quiz-session";

interface PlayableQuizQuestion {
  id: string;
  definition: PlayableQuestion;
}

interface SkippedQuestion {
  id: string;
  reason: "invalid" | "unsupported";
  detail: unknown;
}

function prepareQuestions(questions: QuizEngineProps["questions"]): {
  playable: readonly PlayableQuizQuestion[];
  skipped: readonly SkippedQuestion[];
} {
  const playable: PlayableQuizQuestion[] = [];
  const skipped: SkippedQuestion[] = [];

  for (const question of questions) {
    const parsed = readQuizQuestion(question.definition);
    if (!parsed.success) {
      skipped.push({
        id: question.id,
        reason: "invalid",
        detail: parsed.error.issues,
      });
      continue;
    }
    // Read before the guard narrows the union to `never`. Keep the branch: a fifth format added to
    // the schema must be dropped, not rendered blank.
    const format = parsed.data.type;
    if (!isPlayableQuestion(parsed.data)) {
      skipped.push({ id: question.id, reason: "unsupported", detail: format });
      continue;
    }
    playable.push({ id: question.id, definition: parsed.data });
  }

  return { playable, skipped };
}

export function QuizEngine({ questions, locale, onFinish }: QuizEngineProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();

  const { playable, skipped } = useMemo(
    () => prepareQuestions(questions),
    [questions],
  );

  useEffect(() => {
    for (const question of skipped) {
      // Unconditional, not dev-gated: an unaskable question is a content incident and this is its
      // only trace.
      console.error(
        `[kidlearn] quiz question skipped (${question.reason})`,
        question.id,
        question.detail,
      );
    }
  }, [skipped]);

  const feedback = useQuestionFeedback(locale);
  const session = useQuizSession(playable.length, onFinish);
  const current = playable[session.currentIndex];
  const promptRef = useFocusWhenDropped<HTMLParagraphElement>(current?.id);

  const questionIds = useMemo(
    () => playable.map((question) => question.id),
    [playable],
  );

  // Keyed on the question object, not its audio URL: two questions may share a clip and must each
  // speak on arrival (FR-QUIZ-05).
  const speakPrompt = useCallback(() => {
    if (current === undefined) return;
    void play(current.definition.promptAudio[locale].url, { interrupt: true });
  }, [play, current, locale]);

  useEffect(speakPrompt, [speakPrompt]);

  const handleAttempt = useCallback(
    (_answer: QuizAnswerValue, isCorrect: boolean) =>
      session.attempt(isCorrect),
    [session],
  );

  const handleCommit = useCallback(
    (answer: QuizAnswerValue) => {
      if (current === undefined) return;
      session.commit(current.id, answer);
    },
    [session, current],
  );

  // The quiz is over or had nothing askable; the session has already reported itself finished.
  if (current === undefined) return null;

  return (
    <div
      data-testid="quiz-engine"
      className="flex min-h-0 flex-1 flex-col items-center gap-4"
    >
      {/*
        The one thing that changed, in words: which question this is. The fruit strip is hidden from
        assistive technology so it is not said twice (FR-I18N-01).
      */}
      <span role="status" className="sr-only">
        {t("quiz.progress", {
          current: session.currentIndex + 1,
          total: playable.length,
        })}
      </span>

      <ProgressFruit
        questionIds={questionIds}
        currentIndex={session.currentIndex}
      />

      {/*
        Question and replay side by side: a sideways phone has ~240px and a stacked 64px control
        costs a quarter of it (design.md §6). Audio is how the child reads (FR-QUIZ-05).
      */}
      <div className="flex w-full max-w-2xl shrink-0 items-center justify-center gap-4">
        <p
          ref={promptRef}
          // Where focus lands when the answered question's cards go away.
          tabIndex={-1}
          className="font-display text-2xl text-foreground outline-none sm:text-3xl"
        >
          {current.definition.prompt[locale]}
        </p>
        <IconControl label={t("quiz.replay")} onPress={speakPrompt}>
          <Volume2 aria-hidden="true" className="size-8" />
        </IconControl>
      </div>

      {/*
        Keyed on the question id so tried options do not carry over and fade out cards on the next
        question.
      */}
      <div
        key={current.id}
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-auto"
      >
        {renderQuestion({
          definition: current.definition,
          locale,
          feedback,
          onAttempt: handleAttempt,
          onCommit: handleCommit,
        })}
      </div>
    </div>
  );
}
