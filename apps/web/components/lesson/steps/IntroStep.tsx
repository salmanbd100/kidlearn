"use client";

import { Volume2 } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import type { LessonStepProps } from "./lesson-step-props";

/**
 * The lesson's opening beat — the mascot greets the child and says what the
 * lesson is about (FR-LSN-01, NFR-A11Y-01).
 *
 * **The narration is the screen; the text is a copy of it.** It plays on mount
 * without a tap, because a three-year-old who cannot read has no other way in
 * (Pillar A). `introScript` is rendered large underneath as reinforcement for a
 * reader, an adult sitting alongside, and a device with the sound off — but
 * nothing on this screen depends on it being read.
 *
 * **Two controls, and the advance is never locked.** Hear it again, or go on.
 * Disabling "Let's go!" until the audio finished would trap a child who already
 * knows the lesson behind thirty seconds of a voice they are not listening to,
 * so instead the button simply starts pulsing once the narration is done — the
 * cue is an invitation, not a gate (design.md §1.3).
 */

const MASCOT_PX = 320;

export function IntroStep({ lesson, onComplete }: LessonStepProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const [hasNarrationFinished, setHasNarrationFinished] = useState(false);
  const { introAudioUrl } = lesson;

  useEffect(() => {
    if (
      lesson.assetFallbacks.introAudioUrl &&
      process.env.NODE_ENV !== "production"
    ) {
      // Loud in dev, silent in production: the child hears English either way,
      // and the gap is reported through the `step_complete` event instead.
      console.warn(
        `[kidlearn] lesson ${lesson.id}: speaking the English narration — no recording for the child's locale`,
      );
    }
  }, [lesson.assetFallbacks.introAudioUrl, lesson.id]);

  useEffect(() => {
    if (introAudioUrl === null) {
      // No recording yet for this lesson. The advance cue appears immediately
      // rather than never — silence must not read as "still loading".
      setHasNarrationFinished(true);
      return;
    }
    setHasNarrationFinished(false);
    void play(introAudioUrl, {
      interrupt: true,
      onFinished: () => setHasNarrationFinished(true),
    });
  }, [play, introAudioUrl]);

  const replay = () => {
    if (introAudioUrl === null) return;
    void play(introAudioUrl, {
      interrupt: true,
      onFinished: () => setHasNarrationFinished(true),
    });
  };

  return (
    <section
      data-step="intro"
      className="flex flex-1 flex-col items-center justify-between gap-6 py-4 text-center"
    >
      <MascotGreeting url={lesson.world.mascot?.url} name={lesson.world.name} />

      {lesson.introScript === null ? null : (
        <p className="max-w-prose font-display text-2xl text-foreground sm:text-3xl">
          {lesson.introScript}
        </p>
      )}

      <div className="flex w-full items-center justify-center gap-4">
        {introAudioUrl === null ? null : (
          <button
            type="button"
            // 64px square: a child's control, sized like the exit (design.md §7).
            className="inline-flex size-16 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground transition-colors [touch-action:manipulation] hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={t("intro.replay")}
            onClick={replay}
          >
            <Volume2 aria-hidden="true" className="size-8" />
          </button>
        )}

        <BigButton
          size="lg"
          isPulsing={hasNarrationFinished}
          onPress={onComplete}
        >
          {t("intro.letsGo")}
        </BigButton>
      </div>
    </section>
  );
}

/**
 * The mascot, breathing.
 *
 * A slow vertical bob on `transform` only (design.md §5.2), and completely still
 * under reduced motion — the point of the movement is that the character looks
 * alive while it talks, and a static image loses nothing else.
 *
 * `alt=""`: the character is company, not information. Everything it has to say
 * is in the narration and the script below it, and naming it to a screen reader
 * would only add a noise between the two.
 */
function MascotGreeting({ url, name }: { url?: string; name: string }) {
  const isMotionReduced = useIsMotionReduced();

  if (url === undefined) return null;

  return (
    <motion.div
      data-testid="intro-mascot"
      className="flex flex-1 items-center justify-center"
      animate={isMotionReduced ? undefined : { y: [0, -12, 0] }}
      transition={{
        duration: 3,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      }}
    >
      <Image
        src={url}
        alt=""
        title={name}
        width={MASCOT_PX}
        height={MASCOT_PX}
        priority
        className="h-auto max-h-[40vh] w-auto max-w-full"
      />
    </motion.div>
  );
}
