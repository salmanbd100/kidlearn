/**
 * Activity payload schemas (FR-ACT-06) — the single source of truth for the
 * JSONB stored in `Activity.definition`.
 *
 * Consumed by three independent parties: the frontend activity engines
 * (files 18–20), the backend content validators (files 12, 33), and the AI
 * generation prompts (files 34–35). Change nothing here without checking all
 * three, and honour the additive versioning rule documented in `../primitives`.
 *
 * The union is a plain `z.union`, not `z.discriminatedUnion`: every member
 * carries a `.superRefine()` and is therefore a `ZodEffects`, which
 * `z.discriminatedUnion` rejects. Discrimination still fails fast because the
 * `type` literal mismatches before any expensive refinement runs.
 */
import { z } from "zod";
import {
  ImageAssetRefSchema,
  LocalizedAudioSchema,
  LocalizedTextSchema,
} from "../primitives.js";
import { addDuplicateIdIssues, addPairingIssues } from "../refinements.js";

/**
 * The `satisfies` clause is the drift guard: an entry here that no union member
 * declares is a compile error. The reverse direction — a union member missing
 * from this list — is covered by the coverage test in `./schemas.test.ts`.
 */
export const ACTIVITY_TYPES = [
  "drag_drop",
  "trace",
  "match",
  "puzzle",
] as const satisfies readonly ActivityDefinition["type"][];
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/** A child-facing, tappable/draggable thing: labelled, optionally illustrated and voiced. */
const ActivityItemSchema = z
  .object({
    id: z.string().min(1),
    label: LocalizedTextSchema,
    image: ImageAssetRefSchema.optional(),
    audio: LocalizedAudioSchema.optional(),
  })
  .strict();
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

/** Drop zones always show an image — a pre-reader cannot rely on the label alone. */
const DropTargetSchema = z
  .object({
    id: z.string().min(1),
    label: LocalizedTextSchema,
    image: ImageAssetRefSchema,
  })
  .strict();
export type DropTarget = z.infer<typeof DropTargetSchema>;

function addUnknownMappingIdIssue(
  ctx: z.RefinementCtx,
  index: number,
  field: "itemId" | "targetId",
  id: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["correctMappings", index, field],
    message: `mapping references unknown ${field} "${id}"`,
  });
}

export const DragDropActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("drag_drop"),
    instructionAudio: LocalizedAudioSchema,
    items: z.array(ActivityItemSchema).min(2).max(6),
    targets: z.array(DropTargetSchema).min(2).max(6),
    correctMappings: z
      .array(
        z
          .object({ itemId: z.string().min(1), targetId: z.string().min(1) })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addDuplicateIdIssues(ctx, value.items, "items");
    addDuplicateIdIssues(ctx, value.targets, "targets");

    const itemIds = new Set(value.items.map((item) => item.id));
    const targetIds = new Set(value.targets.map((target) => target.id));
    const mappedItemIds = new Set<string>();

    value.correctMappings.forEach((mapping, index) => {
      if (!itemIds.has(mapping.itemId)) {
        addUnknownMappingIdIssue(ctx, index, "itemId", mapping.itemId);
      } else if (mappedItemIds.has(mapping.itemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctMappings", index, "itemId"],
          message: `item "${mapping.itemId}" is mapped more than once`,
        });
      }
      mappedItemIds.add(mapping.itemId);

      if (!targetIds.has(mapping.targetId)) {
        addUnknownMappingIdIssue(ctx, index, "targetId", mapping.targetId);
      }
    });

    // Every draggable must have somewhere correct to go, or the child can never finish.
    for (const itemId of itemIds) {
      if (!mappedItemIds.has(itemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctMappings"],
          message: `item "${itemId}" has no mapping — every item must map to exactly one target`,
        });
      }
    }
  });
export type DragDropActivity = z.infer<typeof DragDropActivitySchema>;

export const TraceActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("trace"),
    instructionAudio: LocalizedAudioSchema,
    /** The glyph being traced — a letter, Bangla character, or digit, e.g. "A" or "৩". */
    glyph: z.string().min(1),
    /** SVG path the child's finger follows. */
    pathData: z.string().min(1),
    /** Waypoints the renderer snaps to, in trace order. */
    guideDots: z
      .array(z.object({ x: z.number(), y: z.number() }).strict())
      .min(2),
    /**
     * Order in which the glyph's subpaths are traced, one entry per `M` command
     * in `pathData` — omit it for a single-stroke glyph. Nothing cross-validates
     * the count against `pathData`: parsing SVG path syntax belongs in the
     * renderer (file 19), not in a schema.
     */
    strokeOrder: z.array(z.number().int().nonnegative()).min(1).optional(),
    /**
     * How far a finger may stray from the guide and still count, expressed in a
     * reference 0–100 glyph space; the renderer scales it to whatever coordinate
     * range `pathData` actually uses. Optional, and defaulted by the renderer
     * rather than here, so that every trace payload written before this field
     * existed keeps parsing (NFR-SCALE-02) — an optional field the schema
     * declares is not the "extra key on a v1 payload" the versioning rule in
     * `../primitives` forbids.
     */
    tolerance: z.number().positive().max(50).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.pathData.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pathData"],
        message: "pathData must be a non-empty SVG path",
      });
    }
  });
export type TraceActivity = z.infer<typeof TraceActivitySchema>;

export const MatchActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("match"),
    instructionAudio: LocalizedAudioSchema,
    leftSet: z.array(ActivityItemSchema).min(2).max(6),
    rightSet: z.array(ActivityItemSchema).min(2).max(6),
    pairs: z
      .array(
        z
          .object({ leftId: z.string().min(1), rightId: z.string().min(1) })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    addDuplicateIdIssues(ctx, value.leftSet, "leftSet");
    addDuplicateIdIssues(ctx, value.rightSet, "rightSet");
    addPairingIssues(ctx, value.leftSet, value.rightSet, value.pairs, "pairs");
  });
export type MatchActivity = z.infer<typeof MatchActivitySchema>;

/** One cell of the puzzle grid, and the crop of the image that belongs in it. */
const PuzzleSlotSchema = z
  .object({
    index: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
  })
  .strict();
export type PuzzleSlot = z.infer<typeof PuzzleSlotSchema>;

export const PuzzleActivitySchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("puzzle"),
    instructionAudio: LocalizedAudioSchema,
    image: ImageAssetRefSchema,
    grid: z
      .object({
        rows: z.number().int().min(2).max(4),
        cols: z.number().int().min(2).max(4),
      })
      .strict(),
    slots: z.array(PuzzleSlotSchema),
    /**
     * Slot indexes that start already filled and locked, so a Nursery puzzle can
     * hand the child two pieces of a 3×3 rather than nine. Optional, and absent
     * from every payload authored before it existed — an additive field the
     * schema declares, not the "extra key on a v1 payload" the versioning rule
     * in `../primitives` forbids (NFR-SCALE-02).
     */
    prePlaced: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const { rows, cols } = value.grid;
    const expectedSlotCount = rows * cols;

    if (value.slots.length !== expectedSlotCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: `expected ${expectedSlotCount} slots for a ${rows}×${cols} grid, got ${value.slots.length}`,
      });
    }

    const seenIndexes = new Set<number>();
    const seenCells = new Set<string>();

    value.slots.forEach((slot, arrayIndex) => {
      if (slot.row >= rows || slot.col >= cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", arrayIndex],
          message: `slot (${slot.row},${slot.col}) falls outside the ${rows}×${cols} grid`,
        });
      }
      if (slot.index >= expectedSlotCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", arrayIndex, "index"],
          message: `index must be between 0 and ${expectedSlotCount - 1}`,
        });
      }
      if (seenIndexes.has(slot.index)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", arrayIndex, "index"],
          message: `duplicate slot index ${slot.index}`,
        });
      }
      seenIndexes.add(slot.index);

      const cell = `${slot.row},${slot.col}`;
      if (seenCells.has(cell)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", arrayIndex],
          message: `duplicate grid cell (${cell})`,
        });
      }
      seenCells.add(cell);
    });

    if (value.prePlaced === undefined) return;

    const seenPrePlaced = new Set<number>();
    value.prePlaced.forEach((index, arrayIndex) => {
      if (!seenIndexes.has(index)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prePlaced", arrayIndex],
          message: `prePlaced references unknown slot index ${index}`,
        });
      }
      if (seenPrePlaced.has(index)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["prePlaced", arrayIndex],
          message: `duplicate prePlaced slot index ${index}`,
        });
      }
      seenPrePlaced.add(index);
    });

    // A puzzle that starts finished is a step with nothing in it: the renderer
    // would fire completion on mount and the child would never touch a piece.
    if (seenPrePlaced.size >= value.slots.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prePlaced"],
        message: "at least one slot must be left for the child to fill",
      });
    }
  });
export type PuzzleActivity = z.infer<typeof PuzzleActivitySchema>;

export const ActivityDefinitionSchema = z.union([
  DragDropActivitySchema,
  TraceActivitySchema,
  MatchActivitySchema,
  PuzzleActivitySchema,
]);
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;

/**
 * The union, indexed by the `type` literal each member carries. See
 * `QUIZ_QUESTION_SCHEMAS` in `../quiz/schemas` for why anything that already knows
 * the type must parse with the member rather than the union.
 */
export const ACTIVITY_SCHEMAS = {
  drag_drop: DragDropActivitySchema,
  trace: TraceActivitySchema,
  match: MatchActivitySchema,
  puzzle: PuzzleActivitySchema,
} satisfies Record<ActivityType, z.ZodTypeAny>;
