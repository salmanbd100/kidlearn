"use client";

import { Sparkles, Star } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { randomCheerAudioUrl } from "@/components/activities/use-activity-feedback";
import { BigButton } from "@/components/kid/BigButton";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { QuizAnswerRecord } from "./types";

/**
 * How the quiz ends (FR-QUIZ-06).
 *
 * **There is no score on the score screen.** No percentage, no fraction, no
 * grade, and nothing red. One star per question, filled for the ones the child
 * knew straight away and a sparkle for the rest — a sparkle, not an empty
 * outline, because an unfilled slot is a mark against a four-year-old whichever
 * shape it is drawn in. What a child takes from this screen is that they
 * finished, which they did.
 *
 * **The praise is the same however it went.** One pool, played on arrival,
 * regardless of how many stars filled. A celebration that got quieter the worse
 * a child did would teach them exactly what §5.7 exists to avoid.
 *
 * **It renders from the answers, not from the server.** The submission runs
 * alongside this screen and may fail; nothing here waits on it, because a child
 * who finished a quiz has finished it whether or not the network agreed.
 */

/** Kept under `--dur-slow` in total, however many questions the quiz had. */
const STAR_STAGGER_S = 0.08;
const STAR_STAGGER_CAP_S = 0.4;

export function QuizScoreScreen({
  records,
  onDone,
}: {
  records: readonly QuizAnswerRecord[];
  onDone: () => void;
}) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const isMotionReduced = useIsMotionReduced();

  useEffect(() => {
    void play(randomCheerAudioUrl(), { interrupt: true });
  }, [play]);

  return (
    <div
      data-testid="quiz-score"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 text-center"
    >
      {/*
        What the stars say, in words — and deliberately not a count of them. A
        screen reader reading "three of four" would put back the number the whole
        screen is built to leave out (FR-I18N-01).
      */}
      <span role="status" className="sr-only">
        {t("quiz.score.announce")}
      </span>

      <h2 className="font-display text-4xl text-foreground sm:text-5xl">
        {t("quiz.score.title")}
      </h2>

      <ol
        aria-hidden="true"
        data-testid="quiz-score-stars"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {records.map((record, index) => (
          <motion.li
            key={record.questionId}
            data-testid={
              record.isCorrect ? "quiz-score-star" : "quiz-score-sparkle"
            }
            className="flex"
            // Reduced motion gets the finished screen, not a slower version of
            // the animation: Motion writes transforms as inline styles that no
            // stylesheet can neutralise (design.md §5.2).
            initial={isMotionReduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 15,
              delay: Math.min(index * STAR_STAGGER_S, STAR_STAGGER_CAP_S),
            }}
          >
            {record.isCorrect ? (
              <Star className="size-14 fill-accent text-accent" />
            ) : (
              <Sparkles className="size-14 text-accent/70" strokeWidth={2.5} />
            )}
          </motion.li>
        ))}
      </ol>

      <BigButton size="lg" isPulsing onPress={onDone}>
        {t("quiz.score.done")}
      </BigButton>
    </div>
  );
}
