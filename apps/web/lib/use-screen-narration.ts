"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAudio } from "@/components/AudioProvider";
import { type Locale, toLocale } from "./locale";

/**
 * Says out loud what a screen is for, on arrival (NFR-A11Y-01, design.md §1).
 *
 * A three-year-old cannot read "Who's learning today?", so every student screen
 * speaks its own prompt. The clip is chosen by screen key and locale rather than
 * passed in as a URL, so a screen names *what it is* and the asset naming stays
 * one convention rather than a literal in each page.
 *
 * `interrupt: true` is what makes navigation feel right: the audio channel holds
 * one clip at a time, so arriving somewhere new cuts off wherever the child came
 * from instead of talking over it.
 *
 * A missing clip is silent, not an error. Real UI narration arrives with the
 * voice pipeline (file 36); until then these are placeholders, and `AudioProvider`
 * already swallows both a failed load and an autoplay-policy rejection — every
 * prompt is also on screen as text and an icon.
 */

export type ScreenNarrationKey = "selectProfile" | "home" | "world";

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
