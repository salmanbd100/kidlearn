"use client";

import { ArrowRight, Moon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { LESSON_NAMESPACE } from "@/lib/i18n";

/** The way out of an activity that cannot be played (FR-ACT-06). */
export function ActivityUnavailable({
  message,
  audioUrl,
  onSkip,
}: {
  message: string;
  /** Spoken on arrival. Omitted where there is nothing to apologise for. */
  audioUrl?: string;
  onSkip: () => void;
}) {
  const { t } = useTranslation(LESSON_NAMESPACE);
  const { play } = useAudio();

  useEffect(() => {
    if (audioUrl === undefined) return;
    void play(audioUrl, { interrupt: true });
  }, [play, audioUrl]);

  return (
    <div
      data-testid="activity-oops"
      className="flex flex-1 flex-col items-center justify-center gap-8 text-center"
    >
      <Moon
        aria-hidden="true"
        className="size-24 text-muted-foreground"
        strokeWidth={1.5}
      />
      <p className="max-w-prose font-display text-2xl text-foreground">
        {message}
      </p>
      <BigButton
        size="lg"
        isPulsing
        icon={<ArrowRight aria-hidden="true" />}
        onPress={onSkip}
      >
        {t("activity.skip")}
      </BigButton>
    </div>
  );
}
