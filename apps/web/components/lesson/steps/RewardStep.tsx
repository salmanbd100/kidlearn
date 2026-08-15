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
import {
  COIN_COUNT_DURATION_MS,
  CoinCountUp,
} from "@/components/rewards/CoinCountUp";
import { STAR_STAGGER_MS, StarBurst } from "@/components/rewards/StarBurst";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { toLocale } from "@/lib/locale";
import { completeLesson } from "@/lib/progress-api";
import type { LessonStepProps } from "./lesson-step-props";

/**
 * The celebration (FR-LSN-05, FR-GAM-01..02).
 *
 * **Finishing the lesson happens here, on mount.** This is the call that stamps
 * `completedAt` and writes the reward grants; it replaces the reward-step report
 * the player used to send on its way out. Completion therefore lands when the
 * child *reaches* the celebration rather than when they leave it — the numbers
 * on this screen are the server's answer, and there is nowhere else to ask.
 *
 * **The child never sees a failure, and never sees an empty screen.** A rejected
 * request, an offline tablet, a replay that grants nothing: all three land on the
 * same warm celebration and the same big button home. There is nothing here a
 * four-year-old could act on, so there is nothing worth telling them — a lost
 * grant is a row an adult chases later, and a lesson they finished is finished.
 * Zero earned is *already done*, not a failure.
 *
 * **Nothing on this screen is computed here.** Stars and coins arrive from the
 * server; this file renders what it is told (FR-GAM-08).
 */

/** Held after the last star lands, before the coins start climbing. */
const STAR_PHASE_TAIL_MS = 600;

/** The coin phase lasts exactly as long as the count it is waiting for. */
const COIN_PHASE_MS = COIN_COUNT_DURATION_MS;

/** Phases run on a timer rather than gating each other, so a slow frame or a
 *  paused tab cannot leave the celebration half-finished. */
type Phase = "loading" | "stars" | "coins" | "mascot";

const MASCOT_PX = 240;

function celebrationAudioUrl(locale: string): string {
  return `/audio/feedback/celebration-${locale}.mp3`;
}

const COIN_AUDIO_URL = "/audio/feedback/coin-1.mp3";

export function RewardStep({ lesson, onComplete }: LessonStepProps) {
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
  }, [lessonId]);

  const starCount = rewards?.starsEarned ?? 0;
  const coinCount = rewards?.coinsEarned ?? 0;

  // One cheer as the stars land, then the mascot's own line at the end. Two
  // clips and not one per star: the audio channel is single-voice by design, so
  // a cheer per star would only ever interrupt itself (`AudioProvider`).
  useEffect(() => {
    if (phase !== "stars") return;
    void play(randomCheerAudioUrl(), { interrupt: true });

    const toCoins = setTimeout(
      () => setPhase("coins"),
      starCount * STAR_STAGGER_MS + STAR_PHASE_TAIL_MS,
    );
    return () => clearTimeout(toCoins);
  }, [phase, starCount, play]);

  useEffect(() => {
    if (phase !== "coins") return;
    if (coinCount > 0) void play(COIN_AUDIO_URL, { interrupt: true });

    const toMascot = setTimeout(() => setPhase("mascot"), COIN_PHASE_MS);
    return () => clearTimeout(toMascot);
  }, [phase, coinCount, play]);

  useEffect(() => {
    if (phase !== "mascot") return;
    void play(celebrationAudioUrl(locale), { interrupt: true });
  }, [phase, locale, play]);

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
        {announce(t, starCount, coinCount)}
      </span>

      <h2 className="font-display text-4xl text-foreground sm:text-5xl">
        {t("reward.title")}
      </h2>

      <StarBurst count={starCount} />

      {phase === "stars" ? null : (
        <CoinCountUp from={0} to={coinCount} durationMs={COIN_PHASE_MS} />
      )}

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

/**
 * What the celebration says out loud.
 *
 * Everything drawn on this screen is `aria-hidden`, so this sentence is the
 * whole party for a child who cannot see it — and it must not narrate a replay
 * as a failure. "You got 0 stars and 0 coins" is the one thing this screen
 * exists to never say; zero earned is *already done*, and so is a completion the
 * network dropped. Both land on `nothing`, which says the true and warm thing.
 *
 * Four frames rather than one with two counts in it, because a sentence that
 * always names both reads "0 coins" at a child who earned three stars — and
 * because i18next can only pluralise on a single `count`, so the two figures
 * come in as already-translated fragments.
 */
function announce(t: TFunction, starCount: number, coinCount: number): string {
  const stars = t("reward.announce.starCount", { count: starCount });
  const coins = t("reward.announce.coinCount", { count: coinCount });

  if (starCount > 0 && coinCount > 0) {
    return t("reward.announce.both", { stars, coins });
  }
  if (starCount > 0) return t("reward.announce.stars", { stars });
  if (coinCount > 0) return t("reward.announce.coins", { coins });
  return t("reward.announce.nothing");
}

/**
 * The mascot, bouncing, once the counting is over.
 *
 * `alt=""` for the reason `IntroStep` gives: the character is company, not
 * information, and the celebration is already announced above.
 */
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

/**
 * What the child has altogether, small and at the bottom.
 *
 * Small on purpose: the screen is about what they just earned. The running
 * totals are the reassurance that it was added to something, not the headline.
 */
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
