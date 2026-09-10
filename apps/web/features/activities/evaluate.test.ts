import {
  validDragDrop,
  validDragDropManyToOne,
  validMatch,
  validPuzzle,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  evaluateDrop,
  evaluatePair,
  evaluatePiecePlacement,
  groupItemsByTarget,
  isActivityComplete,
  isPuzzleComplete,
  puzzleIndexOfId,
  puzzlePieceId,
  puzzleSlotId,
} from "./evaluate";

/** The ids each target is holding, which is all these assertions care about. */
function idsByTarget(
  grouped: ReadonlyMap<string, readonly { id: string }[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    [...grouped].map(([targetId, items]) => [
      targetId,
      items.map((item) => item.id),
    ]),
  );
}

describe("evaluateDrop", () => {
  it("accepts a pair the definition maps to each other", () => {
    expect(evaluateDrop(validDragDrop, "cow", "farm")).toBe(true);
    expect(evaluateDrop(validDragDrop, "fish", "pond")).toBe(true);
  });

  it("rejects a pair the definition swaps", () => {
    expect(evaluateDrop(validDragDrop, "cow", "pond")).toBe(false);
    expect(evaluateDrop(validDragDrop, "fish", "farm")).toBe(false);
  });

  it("rejects an item the definition has never heard of", () => {
    expect(evaluateDrop(validDragDrop, "dragon", "farm")).toBe(false);
  });

  it("rejects a target the definition has never heard of", () => {
    expect(evaluateDrop(validDragDrop, "cow", "moon")).toBe(false);
  });

  it("rejects the empty string rather than matching a blank mapping", () => {
    expect(evaluateDrop(validDragDrop, "", "")).toBe(false);
  });
});

describe("isActivityComplete", () => {
  it("is false with nothing placed", () => {
    expect(isActivityComplete(validDragDrop, {})).toBe(false);
  });

  it("is false while one mapping is still open", () => {
    expect(isActivityComplete(validDragDrop, { cow: "farm" })).toBe(false);
  });

  it("is true once every mapping has been placed", () => {
    expect(
      isActivityComplete(validDragDrop, { cow: "farm", fish: "pond" }),
    ).toBe(true);
  });
});

describe("groupItemsByTarget", () => {
  it("holds nothing while nothing has been placed", () => {
    expect(groupItemsByTarget(validDragDrop, {}).size).toBe(0);
  });

  it("gives each target the item that belongs to it", () => {
    const grouped = groupItemsByTarget(validDragDrop, {
      cow: "farm",
      fish: "pond",
    });

    expect(idsByTarget(grouped)).toEqual({ farm: ["cow"], pond: ["fish"] });
  });

  it("keeps every item a target holds, not just the last one placed", () => {
    const grouped = groupItemsByTarget(validDragDropManyToOne, {
      cow: "farm",
      sheep: "farm",
      fish: "pond",
      duck: "pond",
    });

    expect(idsByTarget(grouped)).toEqual({
      farm: ["cow", "sheep"],
      pond: ["fish", "duck"],
    });
  });

  it("orders a target's items by the payload, not by when they were placed", () => {
    const grouped = groupItemsByTarget(validDragDropManyToOne, {
      sheep: "farm",
      cow: "farm",
    });

    expect(idsByTarget(grouped)).toEqual({ farm: ["cow", "sheep"] });
  });

  it("ignores a placement whose item the definition has never heard of", () => {
    const grouped = groupItemsByTarget(validDragDrop, {
      cow: "farm",
      dragon: "farm",
    });

    expect(idsByTarget(grouped)).toEqual({ farm: ["cow"] });
  });
});

describe("evaluatePair", () => {
  it("accepts a pair tapped left column first", () => {
    expect(evaluatePair(validMatch, "sun", "day")).toBe(true);
    expect(evaluatePair(validMatch, "moon", "night")).toBe(true);
  });

  it("accepts the same pair tapped right column first (FR-ACT-03)", () => {
    expect(evaluatePair(validMatch, "day", "sun")).toBe(true);
    expect(evaluatePair(validMatch, "night", "moon")).toBe(true);
  });

  it("rejects two cards the payload does not pair", () => {
    expect(evaluatePair(validMatch, "sun", "night")).toBe(false);
    expect(evaluatePair(validMatch, "night", "sun")).toBe(false);
  });

  it("rejects a card the payload has never heard of", () => {
    expect(evaluatePair(validMatch, "star", "night")).toBe(false);
  });

  it("rejects a card tapped against itself", () => {
    expect(evaluatePair(validMatch, "sun", "sun")).toBe(false);
  });

  it("rejects the empty string rather than matching a blank pair", () => {
    expect(evaluatePair(validMatch, "", "")).toBe(false);
  });
});

describe("evaluatePiecePlacement", () => {
  it("accepts the piece cut from the slot it is dropped on", () => {
    for (const slot of validPuzzle.slots) {
      expect(
        evaluatePiecePlacement(
          validPuzzle,
          puzzlePieceId(slot.index),
          puzzleSlotId(slot.index),
        ),
      ).toBe(true);
    }
  });

  it("rejects a piece dropped on a slot it was not cut from", () => {
    expect(
      evaluatePiecePlacement(validPuzzle, puzzlePieceId(0), puzzleSlotId(3)),
    ).toBe(false);
  });

  it("rejects a slot the board does not have", () => {
    expect(
      evaluatePiecePlacement(validPuzzle, puzzlePieceId(9), puzzleSlotId(9)),
    ).toBe(false);
  });

  it("rejects an id that is not a piece id at all", () => {
    expect(evaluatePiecePlacement(validPuzzle, "0", puzzleSlotId(0))).toBe(
      false,
    );
  });
});

describe("puzzleIndexOfId", () => {
  it("reads the index out of a piece id and a slot id", () => {
    expect(puzzleIndexOfId(puzzlePieceId(0))).toBe(0);
    expect(puzzleIndexOfId(puzzleSlotId(7))).toBe(7);
  });

  it("returns nothing for an id it cannot read a number out of", () => {
    expect(puzzleIndexOfId("piece-x")).toBeUndefined();
    expect(puzzleIndexOfId("2")).toBeUndefined();
    expect(puzzleIndexOfId("")).toBeUndefined();
  });
});

describe("isPuzzleComplete", () => {
  it("is false with an empty board", () => {
    expect(isPuzzleComplete(validPuzzle, new Set())).toBe(false);
  });

  it("is false while one slot is still open", () => {
    expect(isPuzzleComplete(validPuzzle, new Set([0, 1, 2]))).toBe(false);
  });

  it("is true once every slot holds its piece", () => {
    expect(isPuzzleComplete(validPuzzle, new Set([0, 1, 2, 3]))).toBe(true);
  });
});
