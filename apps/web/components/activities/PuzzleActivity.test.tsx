import type { DragEndEvent } from "@dnd-kit/core";
import { validPuzzle, validPuzzlePrePlaced } from "@kidlearn/types";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { puzzlePieceId, puzzleSlotId } from "./evaluate";
import { PuzzleActivity } from "./PuzzleActivity";
import type { ActivityFeedback } from "./use-activity-feedback";
import { SHINE_MS, usePuzzleState } from "./use-puzzle-state";
import { WIGGLE_MS } from "./use-wiggle";

/**
 * jsdom cannot perform a drag — there is no layout, so no collision detection and
 * no sensor run. The placement rules are therefore driven through `usePuzzleState`
 * directly, which is the reason that hook exists; the render tests below cover
 * only what the board and tray are made of.
 */

function feedbackSpy() {
  const spy = {
    success: vi.fn<(anchor?: { x: number; y: number }) => void>(),
    retry: vi.fn<() => void>(),
  };
  // `satisfies`, not an annotation: the tests need the mock's own type to read
  // `.mock.calls`, and this still fails the build if the channel's shape moves.
  return spy satisfies ActivityFeedback;
}

const SLOT_RECT = {
  top: 40,
  left: 60,
  right: 160,
  bottom: 140,
  width: 100,
  height: 100,
};

function dropPiece(
  pieceIndex: number,
  slotIndex: number | undefined,
): DragEndEvent {
  // A real `DragEndEvent` carries the whole sensor run — collisions, deltas, the
  // activator event, both measured rects. `handleDragEnd` reads three fields of
  // it, so the fixture supplies those; the cast is what stands in for a drag the
  // environment cannot produce, and narrowing is impossible by construction.
  return {
    active: {
      id: puzzlePieceId(pieceIndex),
      data: { current: undefined },
      rect: { current: {} },
    },
    over:
      slotIndex === undefined
        ? null
        : {
            id: puzzleSlotId(slotIndex),
            rect: SLOT_RECT,
            data: { current: undefined },
            disabled: false,
          },
  } as unknown as DragEndEvent;
}

describe("usePuzzleState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with an empty board", () => {
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), vi.fn()),
    );

    expect([...result.current.filled]).toEqual([]);
    expect(result.current.isComplete).toBe(false);
  });

  it("starts with the prePlaced slots already filled", () => {
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzlePrePlaced, feedbackSpy(), vi.fn()),
    );

    expect([...result.current.filled].sort()).toEqual([0, 1, 2]);
  });

  it("fills the slot a piece belongs to and cheers", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(2, 2)));

    expect([...result.current.filled]).toEqual([2]);
    expect(feedback.success).toHaveBeenCalledTimes(1);
    expect(feedback.retry).not.toHaveBeenCalled();
  });

  it("bursts the confetti over the slot the child actually touched", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 0)));

    expect(feedback.success).toHaveBeenCalledWith({ x: 110, y: 90 });
  });

  it("leaves the board untouched on a wrong slot and encourages instead (FR-ACT-05)", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 3)));

    expect([...result.current.filled]).toEqual([]);
    expect(feedback.retry).toHaveBeenCalledTimes(1);
    expect(feedback.success).not.toHaveBeenCalled();
  });

  it("wiggles the piece that was wrong, and only that one", () => {
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 3)));

    expect(result.current.wiggle?.ids).toEqual([puzzlePieceId(0)]);
  });

  it("wiggles again when the same piece is pushed into the wrong space twice", () => {
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 3)));
    const first = result.current.wiggle?.count;
    act(() => result.current.handleDragEnd(dropPiece(0, 3)));

    expect(result.current.wiggle?.count).not.toBe(first);
  });

  it("stops wiggling once the animation has run", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 3)));
    act(() => {
      vi.advanceTimersByTime(WIGGLE_MS);
    });

    expect(result.current.wiggle).toBeUndefined();
  });

  it("does nothing at all when the piece is let go over empty space", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, undefined)));

    expect([...result.current.filled]).toEqual([]);
    expect(feedback.success).not.toHaveBeenCalled();
    expect(feedback.retry).not.toHaveBeenCalled();
  });

  it("gives the child unlimited retries — a wrong drop never ends the activity", () => {
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), onActivityComplete),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      act(() => result.current.handleDragEnd(dropPiece(0, 3)));
    }

    expect(onActivityComplete).not.toHaveBeenCalled();
    expect([...result.current.filled]).toEqual([]);
  });

  it("holds the finished picture for a beat before reporting the step done", () => {
    vi.useFakeTimers();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), onActivityComplete),
    );

    for (const slot of validPuzzle.slots) {
      act(() =>
        result.current.handleDragEnd(dropPiece(slot.index, slot.index)),
      );
    }

    expect(result.current.isComplete).toBe(true);
    expect(onActivityComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SHINE_MS);
    });

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("lets a child tap through the shine rather than wait it out (design.md §5.2)", () => {
    vi.useFakeTimers();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), onActivityComplete),
    );

    for (const slot of validPuzzle.slots) {
      act(() =>
        result.current.handleDragEnd(dropPiece(slot.index, slot.index)),
      );
    }
    act(() => result.current.skipShine());

    expect(onActivityComplete).toHaveBeenCalledTimes(1);

    // And the timer it pre-empted must not report the step a second time.
    act(() => {
      vi.advanceTimersByTime(SHINE_MS * 3);
    });

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("ignores a skip before the picture is finished", () => {
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), onActivityComplete),
    );

    act(() => result.current.handleDragEnd(dropPiece(0, 0)));
    act(() => result.current.skipShine());

    expect(onActivityComplete).not.toHaveBeenCalled();
  });

  it("counts the prePlaced slots towards completion", () => {
    vi.useFakeTimers();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePuzzleState(validPuzzlePrePlaced, feedbackSpy(), onActivityComplete),
    );

    for (const slot of validPuzzlePrePlaced.slots.slice(3)) {
      act(() =>
        result.current.handleDragEnd(dropPiece(slot.index, slot.index)),
      );
    }
    act(() => {
      vi.advanceTimersByTime(SHINE_MS);
    });

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("reports completion exactly once, however often it re-renders", () => {
    vi.useFakeTimers();
    const onActivityComplete = vi.fn();
    const { result, rerender } = renderHook(() =>
      usePuzzleState(validPuzzle, feedbackSpy(), onActivityComplete),
    );

    for (const slot of validPuzzle.slots) {
      act(() =>
        result.current.handleDragEnd(dropPiece(slot.index, slot.index)),
      );
    }
    rerender();
    act(() => {
      vi.advanceTimersByTime(SHINE_MS * 3);
    });
    rerender();

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });
});

describe("PuzzleActivity", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  function renderActivity(
    definition = validPuzzle,
    locale: "en" | "bn" = "en",
  ) {
    render(
      <Providers locale={locale}>
        <PuzzleActivity
          definition={definition}
          locale={locale}
          feedback={feedbackSpy()}
          onActivityComplete={vi.fn()}
        />
      </Providers>,
    );
  }

  it("draws one slot per grid cell and one tray piece for each", () => {
    renderActivity();

    for (const slot of validPuzzle.slots) {
      expect(
        screen.getByTestId(`puzzle-slot-${slot.index}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`puzzle-piece-${slot.index}`),
      ).toBeInTheDocument();
    }
  });

  it("starts with no slot filled — nothing is given away", () => {
    renderActivity();

    for (const slot of validPuzzle.slots) {
      expect(screen.getByTestId(`puzzle-slot-${slot.index}`)).toHaveAttribute(
        "data-state",
        "empty",
      );
    }
  });

  it("keeps a prePlaced piece out of the tray and its slot filled", () => {
    renderActivity(validPuzzlePrePlaced);

    expect(screen.getByTestId("puzzle-slot-0")).toHaveAttribute(
      "data-state",
      "filled",
    );
    expect(screen.queryByTestId("puzzle-piece-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-piece-3")).toBeInTheDocument();
  });

  it("crops each piece to its own cell of the one shared image", () => {
    renderActivity();

    const topLeft = screen.getByTestId("puzzle-piece-0").firstElementChild;
    const bottomRight = screen.getByTestId("puzzle-piece-3").firstElementChild;

    expect(topLeft).toHaveStyle({ backgroundPosition: "0% 0%" });
    expect(bottomRight).toHaveStyle({ backgroundPosition: "100% 100%" });
  });

  it("names each piece from one rather than from the slot index", () => {
    renderActivity();

    expect(screen.getByRole("button", { name: "Piece 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Piece 0" })).toBeNull();
  });

  it("labels the board with the picture's own alt text", () => {
    renderActivity(validPuzzle, "bn");

    expect(screen.getByTestId("puzzle-board")).toHaveAttribute(
      "aria-label",
      validPuzzle.image.alt?.bn,
    );
  });

  it("shows no shine until the picture is whole", () => {
    renderActivity();

    expect(screen.queryByTestId("puzzle-shine")).not.toBeInTheDocument();
  });
});
