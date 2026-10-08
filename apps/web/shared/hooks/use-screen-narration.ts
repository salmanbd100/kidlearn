"use client";

import { toLocale } from "@kidlearn/i18n";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/shared/components/AudioProvider";
import type { Locale } from "@/shared/lib/locale";

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
