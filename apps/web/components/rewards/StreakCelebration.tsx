"use client";

import type { StreakMilestone } from "@kidlearn/types";
import { Flame } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";

// The three- and seven-day streak party (FR-GAM-06).

/** Enough to read as a burst, few enough to animate on a cheap tablet. */
const FLAME_COUNT = 8;

export interface StreakCelebrationProps {
  /** `3` or `7`. Never rendered for `null` — the caller skips the phase. */
  milestone: Exclude<StreakMilestone, null>;
}

export function StreakCelebration({ milestone }: StreakCelebrationProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  return (
    <div
      data-testid="streak-celebration"
      className="flex flex-col items-center gap-4"
    >
      <div aria-hidden="true" className="flex items-end justify-center gap-1">
        {Array.from({ length: FLAME_COUNT }, (_, index) => (
          <motion.span
            // Identical, ordered flames — there is nothing else to key on.
            // biome-ignore lint/suspicious/noArrayIndexKey: a flame has no identity
            key={index}
            className="flex"
            initial={isMotionReduced ? false : { scale: 0.2, opacity: 0 }}
            animate={
              isMotionReduced
                ? { scale: 1, opacity: 1 }
                : { scale: [0.2, 1.15, 1], opacity: 1 }
            }
            transition={{
              duration: 0.6,
              delay: isMotionReduced ? 0 : index * 0.08,
              ease: "easeOut",
            }}
          >
            {/* The flame is orange because a flame is orange — the decorative
                brand-hue exception in design.md §2.2, as in `RewardStrip`. */}
            <Flame className="size-10 fill-coral text-coral sm:size-12" />
          </motion.span>
        ))}
      </div>

      <p
        aria-hidden="true"
        className="text-center font-display text-3xl text-foreground"
      >
        {t("reward.streakMilestone", { count: milestone })}
      </p>
    </div>
  );
}
