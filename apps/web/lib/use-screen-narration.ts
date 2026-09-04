"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { type Locale, toLocale } from "./locale";

/**
 * Says out loud what a screen is for, on arrival (NFR-A11Y-01, design.md §1).
 */

export type ScreenNarrationKey = "selectProfile" | "home" | "world" | "stories";

export function screenNarrationUrl(
  key: ScreenNarrationKey,
  locale: Locale,
): string {
  return `/audio/ui/${key}.${locale}.mp3`;
}

export function useScreenNarration(key: ScreenNarrationKey): void {
  const { play } = useAudio();
  const { i18n } = useTranslation();
  const locale = toLocale(i18n.resolvedLanguage);

  useEffect(() => {
    void play(screenNarrationUrl(key, locale), { interrupt: true });
  }, [play, key, locale]);
}
