"use client";

import { LESSON_NAMESPACE } from "@kidlearn/i18n";
import {
  type ActivityDefinition,
  type Locale,
  readActivityDefinition,
} from "@kidlearn/types";
import { useIsMotionReduced } from "@kidlearn/ui";
import { Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import { IconControl } from "@/shared/components/kid/IconControl";
import { ActivityUnavailable } from "./ActivityUnavailable";
import { FeedbackLayer } from "./FeedbackLayer";
import { renderActivity } from "./registry";
import { oopsAudioUrl, useActivityFeedback } from "./use-activity-feedback";

export const CELEBRATION_MS = 1500;

export interface ActivityEngineProps {
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
    () => readActivityDefinition(definition),
    [definition],
  );

  useEffect(() => {
    if (parsed.success) return;
    // Unconditional, not dev-gated: a payload that fails to render is a content incident and this
    // is its only trace.
    // Log the issue list; Zod's `message` is a JSON blob.
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

/** Split from the parse so the hooks stay unconditional. */
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

  // The timer and a tap-through can race; report the step once.
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
      // Replay control sits above the board in portrait, beside it in landscape: a sideways phone
      // has ~240px, room for the board or a 64px control, not both (design.md §6).
      className="relative flex flex-1 flex-col gap-4 landscape:flex-row landscape:items-center"
    >
      <div className="flex justify-center">
        <IconControl label={t("activity.replay")} onPress={speakInstruction}>
          <Volume2 aria-hidden="true" className="size-8" />
        </IconControl>
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

function Celebration({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();

  return (
    <motion.button
      type="button"
      data-testid="activity-celebration"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 touch-manipulation"
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
