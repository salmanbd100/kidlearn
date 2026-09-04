"use client";

import type { ScreenTimeBlockCode } from "@kidlearn/types";
import { Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { BigButton } from "@/components/kid/BigButton";
import { STUDENT_NAMESPACE } from "@/lib/i18n";

/**
 * What a child sees when their grown-up's screen-time rule says no (FR-TIME-02,
 * FR-TIME-04).
 */

export interface ScreenTimeLockProps {
  reason: ScreenTimeBlockCode;
  /** `"HH:MM"`, when the server sent one. Only the window screen uses it. */
  windowStart?: string | null;
}

export function ScreenTimeLock({ reason, windowStart }: ScreenTimeLockProps) {
  const { t, i18n } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const { play } = useAudio();

  const isWindow = reason === "OUTSIDE_WINDOW";
  const openingTime =
    isWindow && windowStart
      ? formatTimeOfDay(windowStart, i18n.language)
      : null;

  const title = isWindow
    ? openingTime === null
      ? t("screenTime.windowTitleNoTime")
      : t("screenTime.windowTitle", { time: openingTime })
    : t("screenTime.timeUpTitle");
  const body = isWindow
    ? t("screenTime.windowBody")
    : t("screenTime.timeUpBody");

  /**
   * Says the line out loud, for the child who cannot read it. A missing clip is
   * silent rather than an error — `AudioProvider` swallows both a failed load and
   * an autoplay rejection, and the real narration arrives with the voice pipeline
   * (file 36). Keyed on the reason so switching screens re-announces.
   */
  useEffect(() => {
    void play(`/audio/ui/${narrationKey(reason)}.${i18n.language}.mp3`, {
      interrupt: true,
    });
  }, [play, reason, i18n.language]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
      <span aria-hidden="true" className="text-8xl">
        {isWindow ? "🌤️" : "🌙"}
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl text-foreground">{title}</h1>
        {/* 20px floor — nothing on a kid surface goes below it (design.md §3.2). */}
        <p className="font-display text-foreground text-xl">{body}</p>
      </div>

      <BigButton
        size="lg"
        icon={<Home aria-hidden="true" />}
        onPress={() => router.push("/select-profile")}
      >
        {t("screenTime.back")}
      </BigButton>
    </main>
  );
}

/** The narration clip for each reason. See `lib/use-screen-narration.ts`. */
function narrationKey(reason: ScreenTimeBlockCode): string {
  return reason === "OUTSIDE_WINDOW" ? "outside-window" : "time-up";
}

/** `"08:00"` as the visitor's language writes a clock time. */
function formatTimeOfDay(timeOfDay: string, language: string): string | null {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

  return new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(1970, 0, 1, hours, minutes));
}
