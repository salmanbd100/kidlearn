"use client";

import {
  type ActivityDefinition,
  type Locale,
  safeParseActivityDefinition,
} from "@kidlearn/types";
import { Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { useIsMotionReduced } from "@/hooks/use-reduced-motion";
import { LESSON_NAMESPACE } from "@/lib/i18n";
import { ActivityUnavailable } from "./ActivityUnavailable";
import { FeedbackLayer } from "./FeedbackLayer";
import { renderActivity } from "./registry";
import { oopsAudioUrl, useActivityFeedback } from "./use-activity-feedback";

/**
 * The practice step of every lesson, whatever the practice happens to be
 * (FR-ACT-01, FR-ACT-05, FR-ACT-06, NFR-SCALE-02).
 */

/** How long the celebration holds before the step advances. Tappable-through. */
export const CELEBRATION_MS = 1500;

export interface ActivityEngineProps {
  /** Raw `Activity.definition` JSONB, straight from the lesson API. */
  definition: unknown;
  locale: Locale;
  onComplete: () => void;
}

export function ActivityEngine({
  definition,
  locale,
  onComplete,
}: ActivityEngineProps) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const parsed = useMemo(
    () => safeParseActivityDefinition(definition),
    [definition],
  );

  useEffect(() => {
    if (parsed.success) return;
    // Unconditional, not dev-gated: a payload that reaches a child and fails to
    // render is a content incident, and this line is the only trace of it. The
    // issue list rather than the error object — Zod's `message` is a JSON blob.
    console.error(
      "[kidlearn] activity payload failed validation",
      parsed.error.issues,
    );
  }, [parsed]);

  if (!parsed.success) {
    return (
      <ActivityUnavailable
        message={t("activity.oops")}
        audioUrl={oopsAudioUrl(locale)}
        onSkip={onComplete}
      />
    );
  }

  return (
    <PlayableActivity
      definition={parsed.data}
      locale={locale}
      onComplete={onComplete}
    />
  );
}

/**
 * Split from the parse so the hooks below are unconditional — the oops screen is
 * a different component with different needs, not a branch inside this one.
 */
function PlayableActivity({
  definition,
  locale,
  onComplete,
}: {
  definition: ActivityDefinition;
  locale: Locale;
  onComplete: () => void;
}) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();
  const { feedback, canvasRef } = useActivityFeedback(locale);
  const [isCelebrating, setIsCelebrating] = useState(false);

  const instructionUrl = definition.instructionAudio[locale].url;

  const speakInstruction = useCallback(() => {
    void play(instructionUrl, { interrupt: true });
  }, [play, instructionUrl]);

  useEffect(speakInstruction, [speakInstruction]);

  // The celebration can end two ways — the timer, or a child who taps through it
  // — and the step must only be reported once however they race.
  const hasCompleted = useRef(false);
  const finish = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!isCelebrating) return;
    const timer = window.setTimeout(finish, CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [isCelebrating, finish]);

  const handleActivityComplete = useCallback(() => setIsCelebrating(true), []);

  return (
    <div
      data-testid="activity-engine"
      // The replay control sits above the board in portrait and beside it in
      // landscape. A phone held sideways has around 240px of usable height —
      // enough for the board or for a 64px control stacked on top of it, not
      // both — and the board is the part the child came for (design.md §6).
      className="relative flex flex-1 flex-col gap-4 landscape:flex-row landscape:items-center"
    >
      <div className="flex justify-center">
        <button
          type="button"
          // 64px square, the same control the intro step offers, in the same
          // place: a child who learned it there does not learn it twice.
          className="inline-flex size-16 shrink-0 items-center justify-center rounded-pill bg-secondary text-secondary-foreground transition-colors [touch-action:manipulation] hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={t("activity.replay")}
          onClick={speakInstruction}
        >
          <Volume2 aria-hidden="true" className="size-8" />
        </button>
      </div>

      {renderActivity({
        definition,
        locale,
        feedback,
        onActivityComplete: handleActivityComplete,
      })}

      <FeedbackLayer canvasRef={canvasRef} />

      {isCelebrating ? <Celebration onSkip={finish} /> : null}
    </div>
  );
}

/** The beat between finishing and moving on. */
function Celebration({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.button
      type="button"
      data-testid="activity-celebration"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 [touch-action:manipulation]"
      initial={isMotionReduced ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      onClick={onSkip}
    >
      <span
        role="status"
        className="font-display text-4xl text-foreground sm:text-5xl"
      >
        {t("activity.celebrate")}
      </span>
    </motion.button>
  );
}
