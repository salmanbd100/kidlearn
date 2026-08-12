import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  initialLessonState,
  type LessonPlayerEvent,
  type LessonPlayerState,
  lessonReducer,
} from "./lesson-machine";

/** Applies a sequence of events, so a test reads as the walk a child takes. */
function walk(
  from: LessonPlayerState,
  ...events: LessonPlayerEvent[]
): LessonPlayerState {
  return events.reduce(lessonReducer, from);
}

function playing(
  step: LessonStep,
  isConfirmingExit = false,
): LessonPlayerState {
  return { status: "playing", step, isConfirmingExit };
}

describe("initialLessonState", () => {
  it("starts on the intro with nothing being confirmed", () => {
    expect(initialLessonState).toEqual({
      status: "playing",
      step: "intro",
      isConfirmingExit: false,
    });
  });
});

describe("STEP_COMPLETE", () => {
  it("walks the whole flow intro → reward → finished", () => {
    const steps: string[] = [];
    let state = initialLessonState;

    for (let i = 0; i < LESSON_STEPS.length; i += 1) {
      if (state.status !== "playing") break;
      steps.push(state.step);
      state = lessonReducer(state, { type: "STEP_COMPLETE" });
    }

    expect(steps).toEqual(["intro", "video", "activity", "quiz", "reward"]);
    expect(state).toEqual({ status: "finished" });
  });

  it.each([
    ["intro", "video"],
    ["video", "activity"],
    ["activity", "quiz"],
    ["quiz", "reward"],
  ] as const)("advances %s to %s", (from, to) => {
    expect(lessonReducer(playing(from), { type: "STEP_COMPLETE" })).toEqual(
      playing(to),
    );
  });

  it("finishes from the reward step", () => {
    expect(lessonReducer(playing("reward"), { type: "STEP_COMPLETE" })).toEqual(
      {
        status: "finished",
      },
    );
  });

  it("clears a pending exit confirm as it advances", () => {
    // A step that completes underneath an open dialog leaves no stale one behind.
    expect(
      lessonReducer(playing("video", true), { type: "STEP_COMPLETE" }),
    ).toEqual(playing("activity"));
  });

  it("is ignored once finished", () => {
    const finished: LessonPlayerState = { status: "finished" };

    expect(lessonReducer(finished, { type: "STEP_COMPLETE" })).toBe(finished);
  });
});

describe("RESUME", () => {
  it.each(LESSON_STEPS)("initialises at %s", (step) => {
    expect(lessonReducer(initialLessonState, { type: "RESUME", step })).toEqual(
      playing(step),
    );
  });

  it("is ignored once the child has moved past the intro", () => {
    // Progress loading late must not yank a child backwards out of the step they
    // are already in.
    const inVideo = playing("video");

    expect(lessonReducer(inVideo, { type: "RESUME", step: "quiz" })).toBe(
      inVideo,
    );
  });

  it("is ignored while the exit confirm is open on the intro", () => {
    const confirming = playing("intro", true);

    expect(lessonReducer(confirming, { type: "RESUME", step: "quiz" })).toBe(
      confirming,
    );
  });

  it("is ignored once finished", () => {
    const finished: LessonPlayerState = { status: "finished" };

    expect(lessonReducer(finished, { type: "RESUME", step: "intro" })).toBe(
      finished,
    );
  });

  it("re-resuming the intro is a no-op rather than a reset", () => {
    expect(
      lessonReducer(initialLessonState, { type: "RESUME", step: "intro" }),
    ).toEqual(playing("intro"));
  });
});

describe("exit confirm", () => {
  it("EXIT opens the confirm without leaving the step", () => {
    expect(lessonReducer(playing("activity"), { type: "EXIT" })).toEqual(
      playing("activity", true),
    );
  });

  it("EXIT_CANCEL closes it and loses nothing", () => {
    const state = walk(
      playing("activity"),
      { type: "EXIT" },
      {
        type: "EXIT_CANCEL",
      },
    );

    expect(state).toEqual(playing("activity"));
  });

  it("EXIT_CONFIRM leaves the state alone — navigation is the caller's", () => {
    // The reducer is pure; the player navigates. Modelling the departure as a
    // state would mean rendering a screen nobody is meant to see.
    const confirming = playing("quiz", true);

    expect(lessonReducer(confirming, { type: "EXIT_CONFIRM" })).toBe(
      confirming,
    );
  });

  it("EXIT is idempotent", () => {
    const once = lessonReducer(playing("video"), { type: "EXIT" });

    expect(lessonReducer(once, { type: "EXIT" })).toEqual(once);
  });

  it("EXIT_CANCEL with nothing open changes nothing", () => {
    const state = playing("video");

    expect(lessonReducer(state, { type: "EXIT_CANCEL" })).toBe(state);
  });

  it("EXIT is ignored once finished — there is no lesson left to leave", () => {
    const finished: LessonPlayerState = { status: "finished" };

    expect(lessonReducer(finished, { type: "EXIT" })).toBe(finished);
  });
});

describe("immunity to mashed taps", () => {
  it("survives an arbitrary storm of events without throwing", () => {
    const storm: LessonPlayerEvent[] = [
      { type: "EXIT" },
      { type: "EXIT" },
      { type: "RESUME", step: "reward" },
      { type: "EXIT_CANCEL" },
      { type: "STEP_COMPLETE" },
      { type: "EXIT_CONFIRM" },
      { type: "STEP_COMPLETE" },
      { type: "EXIT_CANCEL" },
      { type: "STEP_COMPLETE" },
      { type: "STEP_COMPLETE" },
      { type: "STEP_COMPLETE" },
      { type: "STEP_COMPLETE" },
      { type: "RESUME", step: "intro" },
      { type: "EXIT" },
    ];

    // A three-year-old taps everything at once. Every invalid event has to be a
    // no-op, never a throw — a crash mid-lesson loses the child's place.
    expect(() => walk(initialLessonState, ...storm)).not.toThrow();
    expect(walk(initialLessonState, ...storm)).toEqual({ status: "finished" });
  });

  it("returns the same object identity when an event does not apply", () => {
    // Referential equality matters: `useReducer` skips the re-render, so a mashed
    // tap costs nothing.
    const state = playing("video");

    expect(lessonReducer(state, { type: "RESUME", step: "quiz" })).toBe(state);
  });
});
