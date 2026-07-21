import { z } from "zod";
import { AssetRefSchema, LocalizedAudioSchema, LocalizedTextSchema } from "../primitives";

export const DragDropActivitySchema = z
    .object({
        schemaVersion: z.literal(1),
        type: z.literal("drag_drop"),
        instructionAudio: LocalizedAudioSchema,
        items: z
            .array(
                z.object({
                    id: z.string().min(1),
                    label: LocalizedTextSchema,
                    image: AssetRefSchema.optional(),
                    audio: LocalizedAudioSchema.optional(),
                }),
            )
            .min(2)
            .max(6),
        targets: z
            .array(z.object({ id: z.string().min(1), label: LocalizedTextSchema, image: AssetRefSchema }))
            .min(2)
            .max(6),
        correctMappings: z.array(z.object({ itemId: z.string(), targetId: z.string() })).min(1),
    })
    .superRefine((val, ctx) => {
        const itemIds = new Set(val.items.map((i) => i.id));
        const targetIds = new Set(val.targets.map((t) => t.id));
        for (const m of val.correctMappings) {
            if (!itemIds.has(m.itemId) || !targetIds.has(m.targetId)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: `mapping ${m.itemId}→${m.targetId} references unknown id` });
            }
        }
        if (val.correctMappings.length !== itemIds.size) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "every item must have exactly one mapping" });
        }
    });
export type DragDropActivity = z.infer<typeof DragDropActivitySchema>;

// TraceActivitySchema: glyph, pathData (z.string().min(1)), guideDots (array of {x,y} min 2), strokeOrder optional
// MatchActivitySchema: leftSet, rightSet, pairs — refine pair ids exist and each id used once
// PuzzleActivitySchema: image, grid {rows: z.number().int().min(2).max(4), cols: same}, slots — refine slots.length === rows*cols

export const ActivityDefinitionSchema = z.discriminatedUnion("type", [
    DragDropActivitySchema.sourceType(), // see note below
    TraceActivitySchema,
    MatchActivitySchema,
    PuzzleActivitySchema,
]);
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;