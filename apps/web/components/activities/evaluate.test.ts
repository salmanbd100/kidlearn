import { validDragDrop, validDragDropManyToOne } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  evaluateDrop,
  groupItemsByTarget,
  isActivityComplete,
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
