import { type LessonDetailResponse, validDragDrop } from "@kidlearn/types";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activityCacheKey,
  clearPreloadCache,
  getPreloaded,
  usePreloadNextStep,
} from "./use-preload-next-step";

const ACTIVITY_ID = "activity_letter_a";
// From the canonical drag-drop fixture: an item's image and a target's, so the
// walk is proved against the real payload shape rather than one written to suit
// it. The audio urls in the same fixture are warmed too, which is harmless.
const ITEM_IMAGE = "https://cdn.kidlearn.test/images/cow.png";
const TARGET_IMAGE = "https://cdn.kidlearn.test/images/farm.png";

function lessonDetail(
  overrides: Partial<LessonDetailResponse> = {},
): LessonDetailResponse {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "letter-a-sounds",
    title: "The Letter A",
    worldId: "world_jungle",
    world: {
      id: "world_jungle",
      slug: "jungle",
      name: "Jungle World",
      palette: { primary: "#2E7D32" },
      mascot: null,
    },
    locale: "en",
    introScript: "Hello!",
    introAudioUrl: null,
    videoUrl: "https://cdn.kidlearn.test/video/en/letter-a.mp4",
    videoPosterUrl: null,
    assetFallbacks: {
      introAudioUrl: false,
      videoUrl: false,
      videoPosterUrl: false,
    },
    activity: {
      id: ACTIVITY_ID,
      type: "drag_drop",
      schemaVersion: 1,
      definition: validDragDrop,
    },
    quiz: null,
    progress: null,
    ...overrides,
  };
}

/**
 * `new Image()` is the whole point of the hook and jsdom will happily try to
 * fetch what it is given, so the constructor is replaced with a recorder.
 */
let requestedUrls: string[] = [];
const RealImage = globalThis.Image;

describe("usePreloadNextStep", () => {
  beforeEach(() => {
    clearPreloadCache();
    requestedUrls = [];
    class RecordingImage {
      set src(value: string) {
        requestedUrls.push(value);
      }
    }
    // jsdom's `Image` is a DOM constructor; the stub only needs the one setter
    // the hook touches, which no structural type can express against `Image`.
    globalThis.Image = RecordingImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = RealImage;
  });

  it("does nothing until the video is actually playing", () => {
    renderHook(() => usePreloadNextStep(lessonDetail(), false));

    // Preloading on mount would compete for bandwidth with the video's own
    // first frames — the point is to spend the idle middle of the film.
    expect(requestedUrls).toEqual([]);
    expect(getPreloaded(activityCacheKey(ACTIVITY_ID))).toBeUndefined();
  });

  it("warms every image the activity definition points at", () => {
    renderHook(() => usePreloadNextStep(lessonDetail(), true));

    expect(requestedUrls).toContain(ITEM_IMAGE);
    expect(requestedUrls).toContain(TARGET_IMAGE);
  });

  it("publishes the activity payload under the key file 18 reads", () => {
    renderHook(() => usePreloadNextStep(lessonDetail(), true));

    expect(getPreloaded(activityCacheKey(ACTIVITY_ID))).toMatchObject({
      id: ACTIVITY_ID,
      type: "drag_drop",
    });
  });

  it("ignores strings that are not asset urls", () => {
    renderHook(() => usePreloadNextStep(lessonDetail(), true));

    // The definition is full of ids, type tags and localized labels; a walk that
    // warmed those would fire a request per word of copy.
    expect(requestedUrls).not.toContain("drag_drop");
    expect(requestedUrls).not.toContain("Cow");
    expect(requestedUrls).not.toContain("cow");
  });

  it("warms each url once however often the video re-enters playing", () => {
    const lesson = lessonDetail();
    const { rerender } = renderHook(
      ({ isActive }) => usePreloadNextStep(lesson, isActive),
      { initialProps: { isActive: true } },
    );

    // A stutter is `playing → waiting → playing`, and re-warming on each one
    // would fight the film the child is trying to watch.
    rerender({ isActive: false });
    rerender({ isActive: true });

    expect(requestedUrls.filter((url) => url === ITEM_IMAGE)).toHaveLength(1);
  });

  it("is a no-op for a lesson with no activity", () => {
    renderHook(() =>
      usePreloadNextStep(lessonDetail({ activity: null }), true),
    );

    expect(requestedUrls).toEqual([]);
  });

  it("returns undefined for a key nothing has warmed", () => {
    expect(getPreloaded("activity:never-seen")).toBeUndefined();
  });
});
