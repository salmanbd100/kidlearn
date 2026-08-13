import type { ActivityItem, DragDropActivity } from "@kidlearn/types";

/**
 * Whether a drop is correct, and whether the child has finished (FR-ACT-01).
 *
 * Plain functions with no React and no DOM: the renderer decides what a drop
 * *looks* like, and this file decides what a drop *means*. Nothing here reads
 * component state, so the rule a child is being marked against is testable as a
 * table rather than through a drag jsdom cannot perform.
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
