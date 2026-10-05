import { type LessonStep, nextLessonStep } from "@kidlearn/types";

export type LessonPlayerState =
  | { status: "playing"; step: LessonStep; isConfirmingExit: boolean }
  | { status: "finished" };

export type LessonPlayerEvent =
  | { type: "STEP_COMPLETE" }
  | { type: "RESUME"; step: LessonStep }
  | { type: "EXIT" }
  | { type: "EXIT_CANCEL" }
  /**
   * Leaving is a navigation, not a state (it would render a screen nobody should see);
   * `LessonPlayer` handles it.
   */
  | { type: "EXIT_CONFIRM" };

export const initialLessonState: LessonPlayerState = {
  status: "playing",
  step: "intro",
  isConfirmingExit: false,
};

export function lessonReducer(
  state: LessonPlayerState,
  event: LessonPlayerEvent,
): LessonPlayerState {
  if (state.status === "finished") return state;

  switch (event.type) {
    case "STEP_COMPLETE": {
      const next = nextLessonStep(state.step);
      if (next === null) return { status: "finished" };
      // The confirm closes as the step changes: its dialog has nothing left to ask about.
      return { status: "playing", step: next, isConfirmingExit: false };
    }

    case "RESUME": {
      // Initialisation only: progress can arrive after the first paint, and resuming then would
      // yank the child backwards.
      if (state.step !== "intro" || state.isConfirmingExit) return state;
      if (state.step === event.step) return state;
      return { status: "playing", step: event.step, isConfirmingExit: false };
    }

    case "EXIT":
      if (state.isConfirmingExit) return state;
      return { ...state, isConfirmingExit: true };

    case "EXIT_CANCEL":
      if (!state.isConfirmingExit) return state;
      return { ...state, isConfirmingExit: false };

    case "EXIT_CONFIRM":
      return state;
  }
}
