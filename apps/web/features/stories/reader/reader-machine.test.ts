import { describe, expect, it } from "vitest";
import {
  initialReaderState,
  type ReaderState,
  readerReducer,
} from "./reader-machine";

// The reading flow as a table of inputs (FR-STORY-02, FR-STORY-06..07).

const THREE_PAGES = initialReaderState(3);

/** Walks `events` from a starting state, so a case reads as a sequence. */
function walk(
  state: ReaderState,
  ...events: Parameters<typeof readerReducer>[1][]
): ReaderState {
  return events.reduce(readerReducer, state);
}

describe("initialReaderState", () => {
  it("opens on page one with auto-advance already on", () => {
    // On by default because the child this is for cannot read the toggle: the
    // story has to keep going by itself, and turning it off is the deliberate act.
    expect(THREE_PAGES).toEqual({
      pageIndex: 0,
      pageCount: 3,
      autoAdvance: true,
      phase: "reading",
      completionRequested: false,
    });
  });
});

describe("turning pages", () => {
  it("advances one page at a time", () => {
    expect(walk(THREE_PAGES, { type: "NEXT" }).pageIndex).toBe(1);
    expect(
      walk(THREE_PAGES, { type: "NEXT" }, { type: "NEXT" }).pageIndex,
    ).toBe(2);
  });

  it("goes back a page, and stays put on the first", () => {
    const second = walk(THREE_PAGES, { type: "NEXT" });

    expect(walk(second, { type: "BACK" }).pageIndex).toBe(0);
    // Identity, not a copy: a three-year-old taps the back arrow on page one
    // repeatedly, and each tap must cost nothing at all to render.
    expect(walk(THREE_PAGES, { type: "BACK" })).toBe(THREE_PAGES);
  });

  it("finishes the story when NEXT is tapped on the last page", () => {
    const lastPage = walk(THREE_PAGES, { type: "NEXT" }, { type: "NEXT" });

    const finished = walk(lastPage, { type: "NEXT" });

    expect(finished.phase).toBe("finished");
    expect(finished.pageIndex).toBe(2);
  });

  it("ignores every navigation once the story is finished", () => {
    const finished = walk(THREE_PAGES, { type: "FINISH" });

    expect(walk(finished, { type: "NEXT" })).toBe(finished);
    expect(walk(finished, { type: "BACK" })).toBe(finished);
    expect(walk(finished, { type: "NARRATION_ENDED" })).toBe(finished);
  });
});

describe("auto-advance", () => {
  it("moves on when the narration ends and the toggle is on", () => {
    expect(walk(THREE_PAGES, { type: "NARRATION_ENDED" }).pageIndex).toBe(1);
  });

  it("stays put when the toggle is off", () => {
    const manual = walk(THREE_PAGES, { type: "TOGGLE_AUTO_ADVANCE" });

    expect(manual.autoAdvance).toBe(false);
    expect(walk(manual, { type: "NARRATION_ENDED" })).toBe(manual);
  });

  it("does not finish the story by itself on the last page", () => {
    const lastPage = walk(THREE_PAGES, { type: "NEXT" }, { type: "NEXT" });

    // The ending is the child's to reach. A story that closed itself while they
    // were still looking at the last picture would take the book away mid-page.
    expect(walk(lastPage, { type: "NARRATION_ENDED" })).toBe(lastPage);
  });

  it("keeps the toggle where the child left it across a page turn", () => {
    const manual = walk(THREE_PAGES, { type: "TOGGLE_AUTO_ADVANCE" });

    expect(walk(manual, { type: "NEXT" }).autoAdvance).toBe(false);
  });
});

describe("completion", () => {
  it("marks completion as requested the first time the story finishes", () => {
    const finished = walk(THREE_PAGES, { type: "FINISH" });

    expect(finished).toMatchObject({
      phase: "finished",
      completionRequested: true,
    });
  });

  it("keeps completionRequested set through Read again, so the reward is asked for once", () => {
    const finished = walk(THREE_PAGES, { type: "FINISH" });

    const second = walk(
      finished,
      { type: "READ_AGAIN" },
      { type: "NEXT" },
      { type: "NEXT" },
      { type: "NEXT" },
    );

    // The flag never resets. It is what stops a child who loves a story from
    // firing the completion call once per reading — the server would refuse to
    // pay twice anyway (FR-STORY-06), and a request per replay is a request that
    // exists only to be turned down.
    expect(second).toMatchObject({
      phase: "finished",
      completionRequested: true,
    });
  });

  it("restarts at page one on Read again", () => {
    const finished = walk(THREE_PAGES, { type: "NEXT" }, { type: "FINISH" });

    expect(walk(finished, { type: "READ_AGAIN" })).toMatchObject({
      phase: "reading",
      pageIndex: 0,
    });
  });

  it("ignores Read again while the child is still reading", () => {
    expect(walk(THREE_PAGES, { type: "READ_AGAIN" })).toBe(THREE_PAGES);
  });

  it("finishes only once, however many times FINISH arrives", () => {
    const finished = walk(THREE_PAGES, { type: "FINISH" });

    expect(walk(finished, { type: "FINISH" })).toBe(finished);
  });
});

describe("a story with no pages", () => {
  const EMPTY = initialReaderState(0);

  it("cannot be paged into", () => {
    expect(walk(EMPTY, { type: "NEXT" }).pageIndex).toBe(0);
    expect(walk(EMPTY, { type: "BACK" })).toBe(EMPTY);
  });
});
