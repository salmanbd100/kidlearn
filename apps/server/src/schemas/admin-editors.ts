/**
 * Route-boundary schemas for the guided editors (file 33, FR-CMS-03, FR-GAM-04).
 */
import {
  ActivityTypeSchema,
  BadgeRuleTypeSchema,
  QuizQuestionTypeSchema,
} from "@kidlearn/types";
import { z } from "zod";

const UuidSchema = z.string().uuid();

/** The internal label a CMS list is built from. Same bound as the file-32 one. */
const AdminLabelSchema = z.string().min(1).max(200);

/**
 * A slug an admin types. Copied bound from `schemas/admin-content.ts` rather than
 * imported: that module's `SlugSchema` is private to it, and a badge slug is a
 * different contract — it is the key `RewardLedger` rows and the file-24 engine
 * refer to, not a URL segment.
 */
const BadgeSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumeric words separated by single hyphens",
  );

/**
 * Rejects `{}` on a `PATCH`, which would otherwise be an edit that changes
 * nothing. Same helper and same reasoning as `admin-content.ts`; restated because
 * that one is private to its module.
 */
const atLeastOneField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  // `refine` hands back `z.infer<TSchema>`, unresolved while `TSchema` is a
  // parameter, so `Object.keys` has nothing concrete to accept. Safe because every
  // caller passes a `.partial()` object schema.
  schema.refine((value) => Object.keys(value as object).length > 0, {
    message: "Provide at least one field to update",
  });

export const QuizIdParamsSchema = z.object({ quizId: UuidSchema }).strict();

export const QuestionParamsSchema = z
  .object({ quizId: UuidSchema, id: UuidSchema })
  .strict();

export const EditorIdParamsSchema = z.object({ id: UuidSchema }).strict();

export type QuizIdParams = z.infer<typeof QuizIdParamsSchema>;
export type QuestionParams = z.infer<typeof QuestionParamsSchema>;

/**
 * Coerced from the query string's `"true"` for the reason `admin-content.ts`
 * gives: `z.boolean()` would reject every request that used the flag.
 */
const IncludeArchivedSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export const EditorListQuerySchema = z
  .object({ includeArchived: IncludeArchivedSchema })
  .strict();

export const ActivityListQuerySchema = z
  .object({
    includeArchived: IncludeArchivedSchema,
    type: ActivityTypeSchema.optional(),
  })
  .strict();

export type EditorListQuery = z.infer<typeof EditorListQuerySchema>;
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;

/**
 * A quiz container carries almost nothing: its questions hold the copy, in both
 * locales, inside their payloads. `title` is an internal label, nullable because
 * an untitled quiz attached to one lesson is a perfectly ordinary thing.
 */
export const QuizCreateSchema = z
  .object({ title: AdminLabelSchema.nullable().optional() })
  .strict();

export const QuizUpdateSchema = atLeastOneField(
  z.object({ title: AdminLabelSchema.nullable() }).partial().strict(),
);

export type QuizCreateBody = z.infer<typeof QuizCreateSchema>;
export type QuizUpdateBody = z.infer<typeof QuizUpdateSchema>;

/** A whole question, create or replace. */
export const QuestionUpsertSchema = z
  .object({ format: QuizQuestionTypeSchema, definition: z.unknown() })
  .strict();

export type QuestionUpsertBody = z.infer<typeof QuestionUpsertSchema>;

export const ActivityUpsertSchema = z
  .object({ type: ActivityTypeSchema, definition: z.unknown() })
  .strict();

export type ActivityUpsertBody = z.infer<typeof ActivityUpsertSchema>;

/** A badge (FR-GAM-04). */
export const BadgeCreateSchema = z
  .object({
    slug: BadgeSlugSchema,
    name: AdminLabelSchema,
    description: z.string().max(500).nullable().optional(),
    ruleType: BadgeRuleTypeSchema,
    rule: z.unknown(),
    iconAssetId: UuidSchema.nullable().optional(),
  })
  .strict();

/** `ruleType` and `rule` travel together or not at all. */
export const BadgeUpdateSchema = atLeastOneField(
  BadgeCreateSchema.partial()
    .strict()
    .refine(
      (value) => (value.ruleType === undefined) === (value.rule === undefined),
      {
        path: ["rule"],
        message: "ruleType and rule must be provided together",
      },
    ),
);

export type BadgeCreateBody = z.infer<typeof BadgeCreateSchema>;
export type BadgeUpdateBody = z.infer<typeof BadgeUpdateSchema>;
