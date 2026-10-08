import type { LessonAssetFallbacks, LessonStep } from "@kidlearn/types";

export function stepAssetFallback(
  step: LessonStep,
  fallbacks: LessonAssetFallbacks,
): boolean | undefined {
  switch (step) {
    case "intro":
      return fallbacks.introAudioUrl;
    case "video":
      return fallbacks.videoUrl;
    // Activity, quiz and reward carry their own localized payloads, so there is no server-resolved
    // URL to fall back from.
    case "activity":
    case "quiz":
    case "reward":
      return undefined;
  }
}
