import type { Locale } from "@kidlearn/types";

const FEEDBACK_AUDIO_DIR = "/audio/feedback";

/**
 * Three of each so a clip is not heard six times. Cheers are wordless and shared; encouragement is
 * per-locale.
 */
const CHEER_COUNT = 3;
const RETRY_COUNT = 3;

function pick(count: number): number {
  return 1 + Math.floor(Math.random() * count);
}

export function cheerAudioUrl(variant: number): string {
  return `${FEEDBACK_AUDIO_DIR}/cheer-${variant}.mp3`;
}

export function retryAudioUrl(locale: Locale, variant: number): string {
  return `${FEEDBACK_AUDIO_DIR}/retry-${locale}-${variant}.mp3`;
}

/** Shared so activities, the quiz and the reward step speak one vocabulary for "yes, that's it". */
export function randomCheerAudioUrl(): string {
  return cheerAudioUrl(pick(CHEER_COUNT));
}

export function randomRetryAudioUrl(locale: Locale): string {
  return retryAudioUrl(locale, pick(RETRY_COUNT));
}

export function oopsAudioUrl(locale: Locale): string {
  return `${FEEDBACK_AUDIO_DIR}/oops-${locale}.mp3`;
}
