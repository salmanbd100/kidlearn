/** Activity payload schemas (FR-ACT-06) — source of truth for the `Activity.definition` JSONB. */
import { z } from "zod";
import {
  ImageAssetRefSchema,
  LocalizedAudioSchema,
  LocalizedTextSchema,
  SCHEMA_VERSION,
} from "../primitives.js";
import { addDuplicateIdIssues, addPairingIssues } from "../refinements.js";

/** `satisfies` makes an entry no union member declares a compile error; the reverse is covered in `./schemas.test.ts`. */
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
    schemaVersion: z.literal(SCHEMA_VERSION),
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
    schemaVersion: z.literal(SCHEMA_VERSION),
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
     * Order the glyph's subpaths are traced, one per `M` in `pathData`; omit for single-stroke.
     * Not cross-validated: parsing SVG path syntax belongs in the renderer.
     */
    strokeOrder: z.array(z.number().int().nonnegative()).min(1).optional(),
    /**
     * Max finger stray from the guide, in a reference 0–100 glyph space the renderer scales.
     * Optional and defaulted by the renderer so older payloads keep parsing (NFR-SCALE-02).
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
    schemaVersion: z.literal(SCHEMA_VERSION),
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
    schemaVersion: z.literal(SCHEMA_VERSION),
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
     * Slot indexes that start filled and locked (e.g. two pieces of a 3×3 for Nursery).
     * Optional so older payloads keep parsing (NFR-SCALE-02).
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

/** The union, indexed by `type`. See `QUIZ_QUESTION_SCHEMAS` in `../quiz/schemas` for why callers that know the type parse with the member. */
export const ACTIVITY_SCHEMAS = {
  drag_drop: DragDropActivitySchema,
  trace: TraceActivitySchema,
  match: MatchActivitySchema,
  puzzle: PuzzleActivitySchema,
} satisfies Record<ActivityType, z.ZodTypeAny>;
