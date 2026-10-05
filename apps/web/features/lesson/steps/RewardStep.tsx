"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import type { LessonCompletionResponse } from "@kidlearn/types";
import { useIsMotionReduced } from "@kidlearn/ui";
import type { TFunction } from "i18next";
import { Coins, Sparkles, Star } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { randomCheerAudioUrl } from "@/features/activities/use-activity-feedback";
import {
  COIN_COUNT_DURATION_MS,
  CoinCountUp,
} from "@/features/rewards/CoinCountUp";
import { STAR_STAGGER_MS, StarBurst } from "@/features/rewards/StarBurst";
import { StreakCelebration } from "@/features/rewards/StreakCelebration";
import { completeLesson } from "@/shared/api/progress-api";
import { useAudio } from "@/shared/components/AudioProvider";
import { BadgeReveal } from "@/shared/components/kid/BadgeReveal";
import { BigButton } from "@/shared/components/kid/BigButton";
import { unlockNames } from "@/shared/lib/unlock-names";
import type { LessonStepProps } from "./lesson-step-props";

const STAR_PHASE_TAIL_MS = 600;

const COIN_PHASE_MS = COIN_COUNT_DURATION_MS;

const UNLOCK_PHASE_MS = 2200;

const STREAK_PHASE_MS = 2000;

/**
 * Phases run on a timer rather than gating each other, so a slow frame or paused tab cannot leave
 * the celebration half-finished.
 */
const PHASES = [
  "stars",
  "coins",
  "badges",
  "characters",
  "streak",
  "mascot",
] as const;

type Phase = "loading" | (typeof PHASES)[number];

const MASCOT_PX = 240;

function celebrationAudioUrl(locale: string): string {
  return `/audio/feedback/celebration-${locale}.mp3`;
}

function streakAudioUrl(locale: string): string {
  return `/audio/feedback/streak-${locale}.mp3`;
}

const COIN_AUDIO_URL = "/audio/feedback/coin-1.mp3";
const UNLOCK_AUDIO_URL = "/audio/feedback/unlock-1.mp3";

function buildSchedule(
  rewards: LessonCompletionResponse | undefined,
): ReadonlyArray<{ phase: Phase; holdMs: number }> {
  const starCount = rewards?.starsEarned ?? 0;

  return PHASES.filter((phase) => {
    if (phase === "badges") return (rewards?.newBadges.length ?? 0) > 0;
    if (phase === "characters") return (rewards?.newCharacters.length ?? 0) > 0;
    if (phase === "streak") return rewards?.streak.milestone != null;
    return true;
  }).map((phase) => ({
    phase,
    holdMs:
      phase === "stars"
        ? starCount * STAR_STAGGER_MS + STAR_PHASE_TAIL_MS
        : phase === "coins"
          ? COIN_PHASE_MS
          : phase === "streak"
            ? STREAK_PHASE_MS
            : UNLOCK_PHASE_MS,
  }));
}

export function RewardStep({
  lesson,
  onComplete,
  isPreview,
  pendingWrites,
  locale,
}: LessonStepProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const [rewards, setRewards] = useState<LessonCompletionResponse | undefined>(
    undefined,
  );
  const [phase, setPhase] = useState<Phase>("loading");
  const lessonId = lesson.id;

  useEffect(() => {
    let isCurrent = true;

    // An admin preview celebrates without finishing anything: no `completedAt`, grants or ledger
    // row (FR-CMS-04); the screen renders as for a replay.
    if (isPreview) {
      setRewards(undefined);
      setPhase("stars");
      return;
    }

    // The quiz reward derives from responses the server holds, so completion waits for the quiz
    // submission.
    const writesSettled = pendingWrites?.settled() ?? Promise.resolve();
    void writesSettled
      .then(() => completeLesson(lessonId))
      .then((result) => {
        if (!isCurrent) return;
        if (!result.ok) {
          // Logged for an adult, invisible to the child; the lesson finished whether or not the
          // network agreed.
          console.warn(
            `[kidlearn] lesson ${lessonId} completion not recorded: ${result.error.code}`,
          );
          setRewards(undefined);
        } else {
          setRewards(result.data);
        }
        setPhase("stars");
      });

    return () => {
      isCurrent = false;
    };
  }, [lessonId, isPreview, pendingWrites]);

  const starCount = rewards?.starsEarned ?? 0;
  const coinCount = rewards?.coinsEarned ?? 0;
  const newBadges = rewards?.newBadges ?? [];
  const newCharacters = rewards?.newCharacters ?? [];
  const milestone = rewards?.streak.milestone ?? null;

  /**
   * One clip per phase, never per item: the audio channel is single-voice, so per-star cheers would
   * interrupt themselves.
   */
  useEffect(() => {
    if (phase === "loading") return;

    const clip =
      phase === "stars"
        ? randomCheerAudioUrl()
        : phase === "coins"
          ? coinCount > 0
            ? COIN_AUDIO_URL
            : undefined
          : phase === "badges" || phase === "characters"
            ? UNLOCK_AUDIO_URL
            : phase === "streak"
              ? streakAudioUrl(locale)
              : celebrationAudioUrl(locale);
    if (clip !== undefined) void play(clip, { interrupt: true });

    const schedule = buildSchedule(rewards);
    const index = schedule.findIndex((entry) => entry.phase === phase);
    const next = schedule[index + 1];
    // The mascot is terminal: the child decides when the screen ends.
    if (next === undefined) return;

    const advance = setTimeout(
      () => setPhase(next.phase),
      schedule[index].holdMs,
    );
    return () => clearTimeout(advance);
  }, [phase, coinCount, locale, play, rewards]);

  if (phase === "loading") {
    return (
      <section
        data-step="reward"
        data-testid="reward-loading"
        className="flex flex-1 flex-col items-center justify-center gap-6"
      >
        {/* Sparkles, not a spinner: the child is waiting for a party. */}
        <Sparkles
          aria-hidden="true"
          className="size-20 animate-pulse text-accent motion-reduce:animate-none"
        />
        <span role="status" className="sr-only">
          {t("reward.loading")}
        </span>
      </section>
    );
  }

  return (
    <section
      data-step="reward"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      {/*
        One announcement for the whole screen: the stars stagger and coins tick 60 times a second,
        which a screen reader cannot follow.
      */}
      <span role="status" className="sr-only">
        {announce(t, starCount, coinCount, newBadges, newCharacters, milestone)}
      </span>

      <h2 className="font-display text-4xl text-foreground sm:text-5xl">
        {t("reward.title")}
      </h2>

      <StarBurst count={starCount} />

      {phase === "stars" ? null : (
        <CoinCountUp from={0} to={coinCount} durationMs={COIN_PHASE_MS} />
      )}

      {/*
        Cards live only for their own phase, or a lesson with many unlocks would scroll a portrait
        phone past its own celebration.
      */}
      {phase === "badges" ? (
        <div className="flex flex-wrap items-start justify-center gap-6">
          {newBadges.map((badge) => (
            <BadgeReveal
              key={badge.id}
              kind="badge"
              name={badge.name}
              imageUrl={badge.iconUrl}
            />
          ))}
        </div>
      ) : null}

      {phase === "characters" ? (
        <div className="flex flex-wrap items-start justify-center gap-6">
          {newCharacters.map((character) => (
            <BadgeReveal
              key={character.id}
              kind="character"
              name={character.name}
              imageUrl={character.imageUrl}
            />
          ))}
        </div>
      ) : null}

      {phase === "streak" && milestone !== null ? (
        <StreakCelebration milestone={milestone} />
      ) : null}

      {phase === "mascot" ? (
        <MascotCheer url={lesson.world.mascot?.url} />
      ) : null}

      {rewards === undefined ? null : <Totals totals={rewards.totals} />}

      <BigButton size="xl" isPulsing onPress={onComplete}>
        {t("reward.done")}
      </BigButton>
    </section>
  );
}

function announce(
  t: TFunction,
  starCount: number,
  coinCount: number,
  newBadges: LessonCompletionResponse["newBadges"],
  newCharacters: LessonCompletionResponse["newCharacters"],
  milestone: LessonCompletionResponse["streak"]["milestone"],
): string {
  const stars = t("reward.announce.starCount", { count: starCount });
  const coins = t("reward.announce.coinCount", { count: coinCount });

  const earned =
    starCount > 0 && coinCount > 0
      ? t("reward.announce.both", { stars, coins })
      : starCount > 0
        ? t("reward.announce.stars", { stars })
        : coinCount > 0
          ? t("reward.announce.coins", { coins })
          : t("reward.announce.nothing");

  // Appended to one sentence, not announced per card: six live-region changes read as six
  // interruptions. Unlocks are named.
  const unlocks = [
    newBadges.length > 0
      ? t("reward.announce.badges", {
          names: unlockNames(t, newBadges),
          count: newBadges.length,
        })
      : undefined,
    newCharacters.length > 0
      ? t("reward.announce.characters", {
          names: unlockNames(t, newCharacters),
          count: newCharacters.length,
        })
      : undefined,
    milestone === null
      ? undefined
      : t("reward.announce.streak", { count: milestone }),
  ].filter((sentence): sentence is string => sentence !== undefined);

  return [earned, ...unlocks].join(" ");
}

/**
 * Bounces once, inside `--dur-slow` (design.md §5.2): a bounce that never stops cannot be switched
 * off (WCAG 2.2.2).
 */
function MascotCheer({ url }: { url?: string }) {
  const isMotionReduced = useIsMotionReduced();

  if (url === undefined) return null;

  return (
    <motion.div
      data-testid="reward-mascot"
      animate={isMotionReduced ? undefined : { y: [0, -20, 0] }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <Image
        src={url}
        alt=""
        width={MASCOT_PX}
        height={MASCOT_PX}
        className="h-auto max-h-[24dvh] w-auto max-w-full"
      />
    </motion.div>
  );
}

function Totals({ totals }: { totals: LessonCompletionResponse["totals"] }) {
  const { t } = useTranslation(LESSON_NAMESPACE);

  return (
    <p
      data-testid="reward-totals"
      className="flex items-center gap-4 font-display text-lg text-muted-foreground"
    >
      {/*
        The count rides inside the label ("5 stars"), never a bare "5" beside an icon a screen
        reader cannot see.
      */}
      <span className="inline-flex items-center gap-2">
        <Star aria-hidden="true" className="size-5 fill-accent text-accent" />
        <span className="sr-only">
          {t("reward.totalStars", { count: totals.stars })}
        </span>
        <span aria-hidden="true">{totals.stars}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Coins aria-hidden="true" className="size-5 fill-accent text-accent" />
        <span className="sr-only">
          {t("reward.totalCoins", { count: totals.coins })}
        </span>
        <span aria-hidden="true">{totals.coins}</span>
      </span>
    </p>
  );
}
