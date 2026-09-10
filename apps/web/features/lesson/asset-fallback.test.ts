import { LESSON_STEPS } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { stepAssetFallback } from "./asset-fallback";

const NONE = {
  introAudioUrl: false,
  videoUrl: false,
  videoPosterUrl: false,
};

describe("stepAssetFallback", () => {
  it("reports the intro's narration, not the lesson's other assets", () => {
    expect(stepAssetFallback("intro", { ...NONE, introAudioUrl: true })).toBe(
      true,
    );
    expect(stepAssetFallback("intro", { ...NONE, videoUrl: true })).toBe(false);
  });

  it("reports the video's film, not the lesson's other assets", () => {
    expect(stepAssetFallback("video", { ...NONE, videoUrl: true })).toBe(true);
    expect(stepAssetFallback("video", { ...NONE, introAudioUrl: true })).toBe(
      false,
    );
  });

  it("does not repeat one missing asset across all five steps", () => {
    const fallbacks = { ...NONE, videoUrl: true };

    const flagged = LESSON_STEPS.filter(
      (step) => stepAssetFallback(step, fallbacks) === true,
    );

    // One missing Bangla video is one gap. Reporting it five times would point
    // a content report at four steps that were never affected.
    expect(flagged).toEqual(["video"]);
  });

  it.each([
    "activity",
    "quiz",
    "reward",
  ] as const)("says nothing at all for %s rather than saying 'no fallback'", (step) => {
    // Those steps carry their own localized payloads, resolved by the engines
    // in files 18–23 — there is no server-resolved url here to have fallen
    // back from, and `undefined` keeps the key off the event entirely.
    expect(
      stepAssetFallback(step, { ...NONE, videoUrl: true }),
    ).toBeUndefined();
  });

  it("covers every step in the flow", () => {
    for (const step of LESSON_STEPS) {
      expect(() => stepAssetFallback(step, NONE)).not.toThrow();
    }
  });
});
