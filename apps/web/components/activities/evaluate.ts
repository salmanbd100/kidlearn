import type { DragDropActivity } from "@kidlearn/types";

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
