import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTapToPlace } from "./use-tap-to-place";

function renderTapToPlace() {
  const place =
    vi.fn<
      (
        itemId: string,
        targetId: string,
        anchor?: { x: number; y: number },
      ) => void
    >();
  const { result } = renderHook(() => useTapToPlace(place));
  return { result, place };
}

describe("useTapToPlace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("picks a card up on a tap, and puts it down on a second", () => {
    const { result } = renderTapToPlace();

    act(() => result.current.toggle("cow"));
    expect(result.current.selectedId).toBe("cow");

    act(() => result.current.toggle("cow"));
    expect(result.current.selectedId).toBeUndefined();
  });

  it("swaps to the card tapped next", () => {
    const { result } = renderTapToPlace();

    act(() => result.current.toggle("cow"));
    act(() => result.current.toggle("fish"));

    expect(result.current.selectedId).toBe("fish");
  });

  it("places the card in hand where the child taps, and empties the hand", () => {
    const { result, place } = renderTapToPlace();

    act(() => result.current.toggle("cow"));
    act(() => result.current.placeOn("farm", { x: 1, y: 2 }));

    expect(place).toHaveBeenCalledWith("cow", "farm", { x: 1, y: 2 });
    expect(result.current.selectedId).toBeUndefined();
  });

  it("does nothing when a target is tapped with nothing in hand", () => {
    const { result, place } = renderTapToPlace();

    act(() => result.current.placeOn("farm"));

    expect(place).not.toHaveBeenCalled();
  });

  it("drops the tapped card when a different one starts being dragged", () => {
    const { result } = renderTapToPlace();

    act(() => result.current.toggle("cow"));
    act(() => result.current.dragHandlers.onDragStart());

    expect(result.current.selectedId).toBeUndefined();
  });

  it("ignores the click a mouse drag ends with, but not the next tap", () => {
    vi.useFakeTimers();
    const { result } = renderTapToPlace();

    act(() => {
      result.current.dragHandlers.onDragEnd();
      result.current.toggle("cow");
    });
    expect(result.current.selectedId).toBeUndefined();

    act(() => vi.runAllTimers());
    act(() => result.current.toggle("cow"));
    expect(result.current.selectedId).toBe("cow");
  });
});
