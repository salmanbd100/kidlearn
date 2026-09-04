import { type LessonStep, nextLessonStep } from "@kidlearn/types";

// The five-step lesson flow, as a pure reducer (FR-LSN-01..05, Pillar B).

export type LessonPlayerState =
  | { status: "playing"; step: LessonStep; isConfirmingExit: boolean }
  | { status: "finished" };

export type LessonPlayerEvent =
  /** The step on screen reported itself done. From `reward`, finishes the lesson. */
  | { type: "STEP_COMPLETE" }
  /** Initialisation from saved server progress. Only applies at the start. */
  | { type: "RESUME"; step: LessonStep }
  | { type: "EXIT" }
  | { type: "EXIT_CANCEL" }
  /**
   * Marks the child's decision to leave. The reducer deliberately does nothing:
   * leaving is a navigation, and modelling it as a state would mean rendering a
   * screen nobody is meant to see. `LessonPlayer` handles it.
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
      // The confirm closes as the step changes: a dialog opened over the step
      // that just finished has nothing left to ask about.
      return { status: "playing", step: next, isConfirmingExit: false };
    }

    case "RESUME": {
      // Initialisation only. Server progress can arrive after the first paint, and
      // by then the child may already have finished the intro — resuming at that
      // point would yank them backwards out of the step they are in.
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
