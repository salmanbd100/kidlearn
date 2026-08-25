import {
  ACTIVITY_SCHEMAS,
  safeParseActivityDefinition,
  validDragDrop,
  validMatch,
  validPuzzle,
  validTrace,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  compileActivity,
  draftFromActivity,
  emptyActivityDraft,
  puzzleSlots,
} from "./activity-draft";

/**
 * What the activity editor's form state compiles to (FR-ACT-06).
 *
 * Same shape and same reasoning as `quiz-draft.test.ts`: the property under test
 * belongs to the compiler, and every assertion runs the real shared schemas rather
 * than a stub.
 */

describe("compileActivity", () => {
  it.each([
    ["drag_drop", validDragDrop],
    ["trace", validTrace],
    ["match", validMatch],
    ["puzzle", validPuzzle],
  ] as const)("round-trips a stored %s without losing anything", (_name, definition) => {
    const parsed = safeParseActivityDefinition(
      compileActivity(draftFromActivity(definition)),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual(definition);
  });

  it("names the missing drop-zone picture rather than failing silently", () => {
    // `drag_drop` targets require an image because a pre-reader cannot rely on the
    // label to know where a thing goes. The key is emitted empty so the issue lands
    // on the picker the author can see.
    const draft = emptyActivityDraft("drag_drop");

    const parsed = ACTIVITY_SCHEMAS.drag_drop.safeParse(compileActivity(draft));

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("targets.0.image.url");
  });

  it("leaves an optional item picture out entirely when none is chosen", () => {
    const compiled = compileActivity(emptyActivityDraft("drag_drop")) as {
      items: Array<Record<string, unknown>>;
    };

    expect(compiled.items[0]).not.toHaveProperty("image");
  });

  it("generates one slot per grid cell", () => {
    // The author picks rows and columns; the slots are arithmetic, and the schema
    // cross-validates them against the grid.
    expect(puzzleSlots(2, 3)).toEqual([
      { index: 0, row: 0, col: 0 },
      { index: 1, row: 0, col: 1 },
      { index: 2, row: 0, col: 2 },
      { index: 3, row: 1, col: 0 },
      { index: 4, row: 1, col: 1 },
      { index: 5, row: 1, col: 2 },
    ]);
  });

  it("builds drag-drop mappings from the per-item choices", () => {
    const draft = emptyActivityDraft("drag_drop");
    draft.mapping = { [draft.items[0].id]: draft.targets[1].id };

    const compiled = compileActivity(draft) as {
      correctMappings: Array<{ itemId: string; targetId: string }>;
    };

    expect(compiled.correctMappings).toEqual([
      { itemId: draft.items[0].id, targetId: draft.targets[1].id },
    ]);
  });
});
