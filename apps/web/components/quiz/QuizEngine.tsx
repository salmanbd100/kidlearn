"use client";

import { safeParseQuizQuestion } from "@kidlearn/types";
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { ProgressFruit } from "./ProgressFruit";
import { isPlayableQuestion, renderQuestion } from "./registry";
import type {
  PlayableQuestion,
  QuizAnswerValue,
  QuizEngineProps,
} from "./types";
import { useQuestionFeedback } from "./use-question-feedback";
import { useQuizSession } from "./use-quiz-session";

/**
 * The quiz step of every lesson, whatever the questions happen to be
 * (FR-QUIZ-01, FR-QUIZ-04, FR-QUIZ-05, FR-QUIZ-07).
 *
 * **It is handed `unknown` and validates it here**, exactly as the activity
 * engine does: the payloads are JSONB written by a CMS author or an AI pipeline,
 * and the server's validation is a different process from this one — so the
 * renderer trusts nothing and parses at the boundary.
 *
 * **A question it cannot render is dropped, never shown.** A payload that fails
 * validation and a format that has not been built yet both end the same way: the
 * question is logged for whoever authored it and the quiz carries on without it.
 * The alternative is a child sitting in front of a blank card with no way past
 * it, and there is no version of that which is better than a shorter quiz.
 *
 * **The concerns every format shares live here, not in the formats.** Speaking
 * the question on arrival, offering it again, the fruit strip, the feedback
 * channel, and the answer records. A format renders one kind of question and
 * nothing else.
 */

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
    const parsed = safeParseQuizQuestion(question.definition);
    if (!parsed.success) {
      skipped.push({
        id: question.id,
        reason: "invalid",
        detail: parsed.error.issues,
      });
      continue;
    }
    if (!isPlayableQuestion(parsed.data)) {
      skipped.push({
        id: question.id,
        reason: "unsupported",
        detail: parsed.data.type,
      });
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
      // Unconditional, not dev-gated: a question that reaches a child and cannot
      // be asked is a content incident, and this line is the only trace of it.
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

  const questionIds = useMemo(
    () => playable.map((question) => question.id),
    [playable],
  );

  // Keyed on the question object, not on its audio URL: two questions in one
  // quiz may legitimately share a clip, and this must speak again on arrival at
  // the second one (FR-QUIZ-05).
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

  // The quiz is over, or had nothing askable in it. Either way the session has
  // already reported itself finished and the step is on its way out.
  if (current === undefined) return null;

  return (
    <div
      data-testid="quiz-engine"
      className="flex min-h-0 flex-1 flex-col items-center gap-4"
    >
      {/*
        The one thing that changed, in words: which question this is. The fruit
        strip says the same thing in pictures and is hidden from assistive
        technology so it is not said twice (FR-I18N-01).
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
        The question and the way to hear it again, side by side: a phone held
        sideways has around 240px of usable height, and stacking a 64px control
        above the prompt costs a quarter of it before an answer is on screen
        (design.md §6). The text is there for the parent sitting alongside —
        audio is the channel the child actually reads with (FR-QUIZ-05).
      */}
      <div className="flex w-full max-w-2xl shrink-0 items-center justify-center gap-4">
        <p className="font-display text-2xl text-foreground sm:text-3xl">
          {current.definition.prompt[locale]}
        </p>
        <button
          type="button"
          // 64px square, the same control in the same place as the intro step's
          // and the activity engine's: a child who learned it there knows it here.
          className="inline-flex size-16 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground transition-colors [touch-action:manipulation] hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={t("quiz.replay")}
          onClick={speakPrompt}
        >
          <Volume2 aria-hidden="true" className="size-8" />
        </button>
      </div>

      {/*
        Keyed on the question id, so advancing gives the next question its own
        component instance: the tried-and-set-aside options belong to the
        question they were tapped on, and carrying them across would fade out
        cards on the next one.
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
