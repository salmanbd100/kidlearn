/**
 * The story reader's flow, as a pure reducer (FR-STORY-02, FR-STORY-06..07).
 *
 * No React, no audio, no timers, no fetching — every effect lives in
 * `StoryReader`. The reducer decides which page is on screen and whether the
 * story is over; the component plays the narration, runs the auto-advance timer
 * and posts the completion. That split is what makes the flow testable as a table.
 *
 * **Every event that does not apply returns the state by identity**, the same hard
 * rule `lesson-machine.ts` states and for the same reason: a three-year-old taps
 * everything, and a reducer that threw on the back arrow at page one would lose
 * their place. Returning the same object also means `useReducer` skips the
 * re-render, so a mashed tap costs nothing.
 *
 * **`completionRequested` never resets.** It is set the first time the story ends
 * and survives `READ_AGAIN`, which is what makes the reward call happen once per
 * mount however many times a child re-reads a story they love. The server would
 * refuse to pay twice regardless (FR-STORY-06) — this keeps the reader from asking.
 */

export interface ReaderState {
  pageIndex: number;
  pageCount: number;
  /** On by default: the child this is for cannot read the toggle. */
  autoAdvance: boolean;
  phase: "reading" | "finished";
  completionRequested: boolean;
}

export type ReaderEvent =
  /** A tapped or swiped page turn. On the last page, ends the story. */
  | { type: "NEXT" }
  | { type: "BACK" }
  /**
   * This page's narration reached its end (after the component's hold). Turns
   * the page only while auto-advance is on, and never ends the story — the
   * ending is the child's to reach.
   */
  | { type: "NARRATION_ENDED" }
  | { type: "TOGGLE_AUTO_ADVANCE" }
  | { type: "FINISH" }
  /** Back to page one, free and unlimited (FR-STORY-06). */
  | { type: "READ_AGAIN" };

export function initialReaderState(pageCount: number): ReaderState {
  return {
    pageIndex: 0,
    pageCount,
    autoAdvance: true,
    phase: "reading",
    completionRequested: false,
  };
}

/** True on the last page, and on the empty story — neither has a page after it. */
function isLastPage(state: ReaderState): boolean {
  return state.pageIndex >= state.pageCount - 1;
}

export function readerReducer(
  state: ReaderState,
  event: ReaderEvent,
): ReaderState {
  switch (event.type) {
    case "NEXT": {
      if (state.phase === "finished") return state;
      if (isLastPage(state)) return finish(state);
      return { ...state, pageIndex: state.pageIndex + 1 };
    }

    case "BACK": {
      if (state.phase === "finished" || state.pageIndex === 0) return state;
      return { ...state, pageIndex: state.pageIndex - 1 };
    }

    case "NARRATION_ENDED": {
      if (state.phase === "finished" || !state.autoAdvance) return state;
      // Deliberately not `NEXT`: reaching the end of the last page's narration
      // must not close the book while the child is still looking at the picture.
      if (isLastPage(state)) return state;
      return { ...state, pageIndex: state.pageIndex + 1 };
    }

    case "TOGGLE_AUTO_ADVANCE":
      return { ...state, autoAdvance: !state.autoAdvance };

    case "FINISH":
      return finish(state);

    case "READ_AGAIN": {
      if (state.phase === "reading") return state;
      // `completionRequested` is carried, not reset — see the file header.
      return { ...state, phase: "reading", pageIndex: 0 };
    }
  }
}

function finish(state: ReaderState): ReaderState {
  if (state.phase === "finished") return state;
  return { ...state, phase: "finished", completionRequested: true };
}
