"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import { useIsMotionReduced } from "@kidlearn/ui";
import { Sparkles, Star } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { randomCheerAudioUrl } from "@/features/activities/use-activity-feedback";
import { useAudio } from "@/shared/components/AudioProvider";
import { BigButton } from "@/shared/components/kid/BigButton";
import type { QuizAnswerRecord } from "./types";

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
        Words, deliberately not a count: "three of four" would put back the number this screen
        leaves out (FR-I18N-01).
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
              record.isFirstAttemptCorrect
                ? "quiz-score-star"
                : "quiz-score-sparkle"
            }
            className="flex"
            // Reduced motion gets the finished screen: Motion writes inline transforms no
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
            {record.isFirstAttemptCorrect ? (
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
