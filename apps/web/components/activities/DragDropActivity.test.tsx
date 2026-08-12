import type { DragEndEvent } from "@dnd-kit/core";
import { validDragDrop } from "@kidlearn/types";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { DragDropActivity } from "./DragDropActivity";
import type { ActivityFeedback } from "./use-activity-feedback";
import { usePlacementState, WIGGLE_MS } from "./use-placement-state";

/**
 * jsdom cannot perform a drag — there is no layout, so no collision detection
 * and no sensor run. The placement rules are therefore driven through
 * `usePlacementState` directly, which is the reason that hook exists; the render
 * tests below cover only what the markup is, not what dragging does to it.
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

const TARGET_RECT = {
  top: 100,
  left: 200,
  right: 300,
  bottom: 200,
  width: 100,
  height: 100,
};

function dragEnd(itemId: string, targetId: string | null): DragEndEvent {
  // A real `DragEndEvent` carries the whole sensor run — collisions, deltas, the
  // activator event, both measured rects. `handleDragEnd` reads three fields of
  // it, so the fixture supplies those; the cast is what stands in for a drag the
  // environment cannot produce, and narrowing is impossible by construction.
  return {
    active: { id: itemId, data: { current: undefined }, rect: { current: {} } },
    over:
      targetId === null
        ? null
        : {
            id: targetId,
            rect: TARGET_RECT,
            data: { current: undefined },
            disabled: false,
          },
  } as unknown as DragEndEvent;
}

describe("usePlacementState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("locks a correct drop into the target and cheers", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "farm")));

    expect(result.current.placed).toEqual({ cow: "farm" });
    expect(feedback.success).toHaveBeenCalledTimes(1);
    expect(feedback.retry).not.toHaveBeenCalled();
  });

  it("bursts the confetti over the target the child actually touched", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "farm")));

    expect(feedback.success).toHaveBeenCalledWith({ x: 250, y: 150 });
  });

  it("leaves a wrong drop unplaced and encourages instead (FR-ACT-05)", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));

    expect(result.current.placed).toEqual({});
    expect(feedback.retry).toHaveBeenCalledTimes(1);
    expect(feedback.success).not.toHaveBeenCalled();
  });

  it("wiggles the card that was wrong, and only that one", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));

    expect(result.current.wiggle?.itemId).toBe("cow");
  });

  it("wiggles again when the same card is dropped wrong twice", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));
    const first = result.current.wiggle?.count;
    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));

    expect(result.current.wiggle?.count).not.toBe(first);
  });

  it("stops wiggling once the animation has run", () => {
    vi.useFakeTimers();
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));
    act(() => {
      vi.advanceTimersByTime(WIGGLE_MS);
    });

    expect(result.current.wiggle).toBeUndefined();
  });

  it("does nothing at all when the card is let go over empty space", () => {
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", null)));

    expect(result.current.placed).toEqual({});
    expect(feedback.success).not.toHaveBeenCalled();
    expect(feedback.retry).not.toHaveBeenCalled();
  });

  it("gives the child unlimited retries — a wrong drop never ends the activity", () => {
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, onActivityComplete),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));
    }

    expect(onActivityComplete).not.toHaveBeenCalled();
    expect(result.current.placed).toEqual({});
  });

  it("reports completion when the last mapping is placed", () => {
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, onActivityComplete),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "farm")));
    expect(onActivityComplete).not.toHaveBeenCalled();

    act(() => result.current.handleDragEnd(dragEnd("fish", "pond")));

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });

  it("reports completion exactly once, however often it re-renders", () => {
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    const { result, rerender } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, onActivityComplete),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "farm")));
    act(() => result.current.handleDragEnd(dragEnd("fish", "pond")));
    rerender();
    rerender();

    expect(onActivityComplete).toHaveBeenCalledTimes(1);
  });
});

describe("DragDropActivity", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  function renderActivity(locale: "en" | "bn" = "en") {
    render(
      <Providers locale={locale}>
        <DragDropActivity
          definition={validDragDrop}
          locale={locale}
          feedback={feedbackSpy()}
          onActivityComplete={vi.fn()}
        />
      </Providers>,
    );
  }

  it("puts every item in the tray and every target on the board", () => {
    renderActivity();

    expect(screen.getByTestId("activity-item-cow")).toBeInTheDocument();
    expect(screen.getByTestId("activity-item-fish")).toBeInTheDocument();
    expect(screen.getByTestId("activity-target-farm")).toBeInTheDocument();
    expect(screen.getByTestId("activity-target-pond")).toBeInTheDocument();
  });

  it("labels each card in the child's own language, not the payload's first one", () => {
    renderActivity("bn");

    expect(screen.getByTestId("activity-item-cow")).toHaveTextContent("গরু");
    expect(screen.getByTestId("activity-target-pond")).toHaveTextContent("পুকুর");
  });

  it("starts with no target filled — nothing is given away", () => {
    renderActivity();

    expect(screen.getByTestId("activity-target-farm")).toHaveAttribute(
      "data-state",
      "empty",
    );
  });

  it("shows no error iconography anywhere on the board (FR-ACT-05)", () => {
    renderActivity();

    expect(screen.queryByText("✗")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-drag-drop").textContent).not.toMatch(
      /wrong|try again/i,
    );
  });
});
