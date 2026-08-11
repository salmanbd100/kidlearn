import type { LessonAssetFallbacks, LessonStep } from "@kidlearn/types";

/**
 * Whether the step a child just finished played an English asset because their
 * own locale had none (FR-I18N-01).
 *
 * **Per step, not per lesson.** The lesson payload flags each asset separately,
 * and each step consumes exactly one of them: the intro is its narration, the
 * video is its film. Reporting the lesson's flags wholesale on every
 * `step_complete` would count one missing Bangla video five times and point the
 * content report at four steps that were never affected.
 *
 * The three steps with no locale-resolved media of their own report `undefined`
 * rather than `false`, so the event omits the key entirely — "this step has
 * nothing to say about locale" and "this step played the right locale" are
 * different facts, and only the second is worth a row in a report.
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
