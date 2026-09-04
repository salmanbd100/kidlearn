"use client";

import type { LessonCompletionResponse } from "@kidlearn/types";
import type { TFunction } from "i18next";
import { Coins, Sparkles, Star } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { randomCheerAudioUrl } from "@/components/activities/use-activity-feedback";
import { BigButton } from "@/components/kid/BigButton";
import { BadgeReveal } from "@/components/rewards/BadgeReveal";
import {
  COIN_COUNT_DURATION_MS,
  CoinCountUp,
} from "@/components/rewards/CoinCountUp";
import { STAR_STAGGER_MS, StarBurst } from "@/components/rewards/StarBurst";
import { StreakCelebration } from "@/components/rewards/StreakCelebration";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";
import { completeLesson } from "@/lib/progress-api";
import type { LessonStepProps } from "./lesson-step-props";

// The celebration (FR-LSN-05, FR-GAM-01..02).

/** Held after the last star lands, before the coins start climbing. */
const STAR_PHASE_TAIL_MS = 600;

/** The coin phase lasts exactly as long as the count it is waiting for. */
const COIN_PHASE_MS = COIN_COUNT_DURATION_MS;

/** Long enough to look at a new badge or character and hear its name. */
const UNLOCK_PHASE_MS = 2200;

/** The flame burst, plus a beat to read the line under it. */
const STREAK_PHASE_MS = 2000;

/**
 * Phases run on a timer rather than gating each other, so a slow frame or a
 * paused tab cannot leave the celebration half-finished.
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

/** Which phases this particular completion plays, and how long each holds. */
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

export function RewardStep({ lesson, onComplete, isPreview }: LessonStepProps) {
  const { t, i18n } = useTranslation(LESSON_NAMESPACE);
  const locale = toLocale(i18n.resolvedLanguage);
  const { play } = useAudio();
  const [rewards, setRewards] = useState<LessonCompletionResponse | undefined>(
    undefined,
  );
  const [phase, setPhase] = useState<Phase>("loading");
  const lessonId = lesson.id;

  useEffect(() => {
    let isCurrent = true;

    // An administrator preview celebrates without finishing anything: no
    // `completedAt`, no grants, no ledger row (FR-CMS-04). The screen still plays
    // — with nothing earned, which is a shape it already renders for a replay.
    if (isPreview) {
      setRewards(undefined);
      setPhase("stars");
      return;
    }

    void completeLesson(lessonId).then((result) => {
      if (!isCurrent) return;
      if (!result.ok) {
        // Logged for an adult, invisible to the child. The lesson was finished
        // whether or not the network agreed.
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
  }, [lessonId, isPreview]);

  const starCount = rewards?.starsEarned ?? 0;
  const coinCount = rewards?.coinsEarned ?? 0;
  const newBadges = rewards?.newBadges ?? [];
  const newCharacters = rewards?.newCharacters ?? [];
  const milestone = rewards?.streak.milestone ?? null;

  /**
   * One clip per phase, and never one per item: the audio channel is
   * single-voice by design, so a cheer per star or a chime per badge would only
   * ever interrupt itself (`AudioProvider`).
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
    // The mascot is terminal — nothing is scheduled after it, so the child
    // decides when the screen ends.
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
        {/* Sparkles rather than a spinner: this is the last screen of a lesson,
            and the child is waiting for a party, not for a page. */}
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
        One announcement for the whole screen, in words rather than as a running
        commentary: the stars stagger and the coins tick 60 times a second, and
        neither is something a screen reader can usefully follow.
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

      {/* A reveal is a moment, so the cards live only for their own phase —
          otherwise a lesson that unlocked two badges, a character and a streak
          would leave a portrait phone scrolling past its own celebration. */}
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

/** What the celebration says out loud. */
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

  // Appended to the same sentence rather than announced by each card, because a
  // live region that changes six times reads as six interruptions. The unlocks
  // are named — "a new badge" tells a child who cannot see the screen nothing.
  const unlocks = [
    newBadges.length > 0
      ? t("reward.announce.badges", {
          names: names(t, newBadges),
          count: newBadges.length,
        })
      : undefined,
    newCharacters.length > 0
      ? t("reward.announce.characters", {
          names: names(t, newCharacters),
          count: newCharacters.length,
        })
      : undefined,
    milestone === null
      ? undefined
      : t("reward.announce.streak", { count: milestone }),
  ].filter((sentence): sentence is string => sentence !== undefined);

  return [earned, ...unlocks].join(" ");
}

/** "Leo", or "Leo and Mia" — joined through i18next, because the conjunction
 *  and the separator are both language-specific. */
function names(t: TFunction, items: ReadonlyArray<{ name: string }>): string {
  if (items.length === 1) return items[0].name;
  return t("reward.announce.nameList", {
    first: items
      .slice(0, -1)
      .map((item) => item.name)
      .join(t("reward.announce.nameSeparator")),
    last: items[items.length - 1].name,
  });
}

/** The mascot, bouncing, once the counting is over. */
function MascotCheer({ url }: { url?: string }) {
  const isMotionReduced = useIsMotionReduced();

  if (url === undefined) return null;

  return (
    <motion.div
      data-testid="reward-mascot"
      animate={isMotionReduced ? undefined : { y: [0, -20, 0] }}
      transition={{
        duration: 0.9,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      }}
    >
      <Image
        src={url}
        alt=""
        width={MASCOT_PX}
        height={MASCOT_PX}
        className="h-auto max-h-[24vh] w-auto max-w-full"
      />
    </motion.div>
  );
}

/** What the child has altogether, small and at the bottom. */
function Totals({ totals }: { totals: LessonCompletionResponse["totals"] }) {
  const { t } = useTranslation(LESSON_NAMESPACE);

  return (
    <p
      data-testid="reward-totals"
      className="flex items-center gap-4 font-display text-lg text-muted-foreground"
    >
      {/* The count rides inside the label — "5 stars", never a bare "5" read
          out next to an icon a screen reader cannot see (as `RewardStrip`). */}
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
