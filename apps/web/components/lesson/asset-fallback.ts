import type { LessonAssetFallbacks, LessonStep } from "@kidlearn/types";

/**
 * Whether the step a child just finished played an English asset because their
 * own locale had none (FR-I18N-01).
 */
export function stepAssetFallback(
  step: LessonStep,
  fallbacks: LessonAssetFallbacks,
): boolean | undefined {
  switch (step) {
    case "intro":
      return fallbacks.introAudioUrl;
    case "video":
      return fallbacks.videoUrl;
    // Activity, quiz and reward carry their own localized payloads, which the
    // engines in files 18–23 resolve themselves — there is no server-resolved
    // URL here for them to have fallen back from.
    case "activity":
    case "quiz":
    case "reward":
      return undefined;
  }
}
