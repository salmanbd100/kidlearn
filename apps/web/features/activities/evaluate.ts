import type {
  ActivityItem,
  DragDropActivity,
  MatchActivity,
  PuzzleActivity,
} from "@kidlearn/types";

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
 * Counting is enough: an item enters `placed` only via a correct drop and the schema guarantees one
 * mapping per item.
 */
export function isActivityComplete(
  definition: DragDropActivity,
  placed: PlacedItems,
): boolean {
  return Object.keys(placed).length === definition.correctMappings.length;
}

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

export function puzzlePieceId(slotIndex: number): string {
  return `piece-${slotIndex}`;
}

export function puzzleSlotId(slotIndex: number): string {
  return `slot-${slotIndex}`;
}

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
