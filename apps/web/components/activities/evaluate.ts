import type {
  ActivityItem,
  DragDropActivity,
  MatchActivity,
  PuzzleActivity,
} from "@kidlearn/types";

/**
 * What counts as a right answer, for every activity that has one
 * (FR-ACT-01, FR-ACT-03, FR-ACT-04).
 */

/** Which target each item has been dropped into, keyed by item id. */
export type PlacedItems = Readonly<Record<string, string>>;

export function evaluateDrop(
  definition: DragDropActivity,
  itemId: string,
  targetId: string,
): boolean {
  return definition.correctMappings.some(
    (mapping) => mapping.itemId === itemId && mapping.targetId === targetId,
  );
}

/**
 * Counting placements is enough: an item only ever enters `placed` through a
 * correct drop, and the schema guarantees one mapping per item, so the count
 * cannot reach the total by placing the same item twice.
 */
export function isActivityComplete(
  definition: DragDropActivity,
  placed: PlacedItems,
): boolean {
  return Object.keys(placed).length === definition.correctMappings.length;
}

/**
 * Which items are sitting in each target, so a target can draw its own answers.
 */
export function groupItemsByTarget(
  definition: DragDropActivity,
  placed: PlacedItems,
): ReadonlyMap<string, readonly ActivityItem[]> {
  const byTarget = new Map<string, ActivityItem[]>();

  for (const item of definition.items) {
    const targetId = placed[item.id];
    if (targetId === undefined) continue;

    const held = byTarget.get(targetId);
    if (held === undefined) byTarget.set(targetId, [item]);
    else held.push(item);
  }

  return byTarget;
}

/** Whether two tapped cards are a pair (FR-ACT-03). */
export function evaluatePair(
  definition: Pick<MatchActivity, "pairs">,
  aId: string,
  bId: string,
): boolean {
  return definition.pairs.some(
    (pair) =>
      (pair.leftId === aId && pair.rightId === bId) ||
      (pair.leftId === bId && pair.rightId === aId),
  );
}

/** dnd-kit ids for one puzzle slot and the piece that belongs in it. */
export function puzzlePieceId(slotIndex: number): string {
  return `piece-${slotIndex}`;
}

export function puzzleSlotId(slotIndex: number): string {
  return `slot-${slotIndex}`;
}

/** The slot index inside a `piece-N` or `slot-N` id. */
export function puzzleIndexOfId(id: string): number | undefined {
  const separator = id.indexOf("-");
  if (separator < 0) return undefined;

  const index = Number(id.slice(separator + 1));
  return Number.isInteger(index) ? index : undefined;
}

export function evaluatePiecePlacement(
  definition: Pick<PuzzleActivity, "slots">,
  pieceId: string,
  slotId: string,
): boolean {
  const slot = definition.slots.find(
    (candidate) => puzzleSlotId(candidate.index) === slotId,
  );

  return slot !== undefined && puzzlePieceId(slot.index) === pieceId;
}

export function isPuzzleComplete(
  definition: Pick<PuzzleActivity, "slots">,
  filled: ReadonlySet<number>,
): boolean {
  return definition.slots.every((slot) => filled.has(slot.index));
}
