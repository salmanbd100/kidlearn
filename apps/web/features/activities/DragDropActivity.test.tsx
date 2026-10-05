import type { DragEndEvent } from "@dnd-kit/core";
import { validDragDrop, validDragDropManyToOne } from "@kidlearn/types";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { DragDropActivity } from "./DragDropActivity";
import type { ActivityFeedback } from "./use-activity-feedback";
import { usePlacementState } from "./use-placement-state";
import { NOT_QUITE_MS } from "./use-wiggle";

/**
 * jsdom cannot drag (no layout), so placement rules are driven through `usePlacementState`; render
 * tests cover markup only.
 */

function feedbackSpy() {
  const spy = {
    success: vi.fn<(anchor?: { x: number; y: number }) => void>(),
    retry: vi.fn<() => void>(),
  };
  // `satisfies` keeps the mock's own type for `.mock.calls`.
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
  // The cast stands in for a drag jsdom cannot produce; `handleDragEnd` reads only three fields.
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

    expect(result.current.wiggle?.ids).toEqual(["cow"]);
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

  it("clears the wiggle once the have-another-go cue has run", () => {
    vi.useFakeTimers();
    const feedback = feedbackSpy();
    const { result } = renderHook(() =>
      usePlacementState(validDragDrop, feedback, vi.fn()),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "pond")));
    act(() => {
      vi.advanceTimersByTime(NOT_QUITE_MS);
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

  it("lets several items share one target, and finishes when all are placed", () => {
    const feedback = feedbackSpy();
    const onActivityComplete = vi.fn();
    const { result } = renderHook(() =>
      usePlacementState(validDragDropManyToOne, feedback, onActivityComplete),
    );

    act(() => result.current.handleDragEnd(dragEnd("cow", "farm")));
    act(() => result.current.handleDragEnd(dragEnd("sheep", "farm")));
    act(() => result.current.handleDragEnd(dragEnd("fish", "pond")));
    expect(onActivityComplete).not.toHaveBeenCalled();

    act(() => result.current.handleDragEnd(dragEnd("duck", "pond")));

    expect(result.current.placed).toEqual({
      cow: "farm",
      sheep: "farm",
      fish: "pond",
      duck: "pond",
    });
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

  function renderActivity(
    locale: "en" | "bn" = "en",
    definition = validDragDrop,
  ) {
    render(
      <Providers locale={locale}>
        <DragDropActivity
          definition={definition}
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

  it("trays every item of a sorting payload, however few targets it has", () => {
    renderActivity("en", validDragDropManyToOne);

    for (const id of ["cow", "sheep", "fish", "duck"]) {
      expect(screen.getByTestId(`activity-item-${id}`)).toBeInTheDocument();
    }
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

  describe("tap to place — the path that needs no drag", () => {
    function renderWithSpies() {
      const feedback = feedbackSpy();
      const onActivityComplete = vi.fn();
      render(
        <Providers locale="en">
          <DragDropActivity
            definition={validDragDrop}
            locale="en"
            feedback={feedback}
            onActivityComplete={onActivityComplete}
          />
        </Providers>,
      );
      return { feedback, onActivityComplete };
    }

    const tap = (testId: string) => fireEvent.click(screen.getByTestId(testId));

    it("makes every target a button, so a keyboard or VoiceOver can reach it", () => {
      renderWithSpies();

      expect(screen.getByTestId("activity-target-farm").tagName).toBe("BUTTON");
    });

    it("marks the tapped card as in hand, and says so", () => {
      renderWithSpies();

      tap("activity-item-cow");

      expect(screen.getByTestId("activity-item-cow")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(
        screen.getByText("Cow is picked. Now tap where it goes."),
      ).toHaveAttribute("role", "status");
    });

    it("places the card in hand on the right target and cheers", () => {
      const { feedback } = renderWithSpies();

      tap("activity-item-cow");
      tap("activity-target-farm");

      expect(feedback.success).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("activity-placed-cow")).toBeInTheDocument();
      expect(screen.queryByTestId("activity-item-cow")).toBeNull();
    });

    it("encourages, and marks the card, on a wrong target (FR-ACT-05)", () => {
      const { feedback } = renderWithSpies();

      tap("activity-item-cow");
      tap("activity-target-pond");

      expect(feedback.retry).toHaveBeenCalledTimes(1);
      const cow = screen.getByTestId("activity-item-cow");
      expect(cow).toHaveAttribute("aria-pressed", "false");
      expect(within(cow).getByTestId("status-mark-retry")).toBeInTheDocument();
    });

    it("finishes the activity by tapping alone", () => {
      const { onActivityComplete } = renderWithSpies();

      tap("activity-item-cow");
      tap("activity-target-farm");
      tap("activity-item-fish");
      tap("activity-target-pond");

      expect(onActivityComplete).toHaveBeenCalledTimes(1);
    });
  });
});
