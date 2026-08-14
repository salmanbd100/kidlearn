import type {
  ActivityItem,
  DragDropActivity,
  MatchActivity,
  PuzzleActivity,
} from "@kidlearn/types";

/**
 * What counts as a right answer, for every activity that has one
 * (FR-ACT-01, FR-ACT-03, FR-ACT-04).
 *
 * Plain functions with no React and no DOM: the renderers decide what an answer
 * *looks* like, and this file decides what an answer *means*. Nothing here reads
 * component state, so the rule a child is being marked against is testable as a
 * table rather than through a drag or a tap jsdom cannot perform.
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
 *
 * **A list, not a single item.** The schema pins each *item* to exactly one
 * target but places no limit in the other direction, so "put the animals where
 * they live" — four items, two homes — is a valid payload. A target that holds
 * one item silently loses every answer but the last: the card is gone from the
 * tray, because it was placed, and absent from the board, because something
 * else overwrote it.
 *
 * Ordered by `definition.items` rather than by when the child placed them, so a
 * target redraws in the same order on every render.
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

/**
 * Whether two tapped cards are a pair (FR-ACT-03).
 *
 * **Order-agnostic, and that is the whole point.** The payload names one side
 * `leftId` and the other `rightId`, but a child tapping the right column first is
 * not making a different move — so both readings are checked and the renderer
 * never has to normalise which side a tap came from.
 *
 * Takes `Pick<…, "pairs">` rather than the whole definition so file 22's
 * `match_pair` quiz format can mark itself against the same rule.
 */
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

/**
 * dnd-kit ids for one puzzle slot and the piece that belongs in it.
 *
 * Both derive from `slot.index`, which is what makes `evaluatePiecePlacement` a
 * comparison rather than a lookup table: the payload already says which crop of
 * the image belongs in which cell, so the piece for slot 4 *is* piece 4.
 */
export function puzzlePieceId(slotIndex: number): string {
  return `piece-${slotIndex}`;
}

export function puzzleSlotId(slotIndex: number): string {
  return `slot-${slotIndex}`;
}

/**
 * The slot index inside a `piece-N` or `slot-N` id.
 *
 * Only the live-region copy needs this: dnd-kit hands its announcement callbacks
 * the ids it was given, and "piece 4" has to be spoken as a number.
 */
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
