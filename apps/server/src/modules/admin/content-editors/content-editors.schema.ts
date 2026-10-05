import {
  ActivityTypeSchema,
  BadgeRuleTypeSchema,
  QuizQuestionTypeSchema,
} from "@kidlearn/types";
import { z } from "zod";

const UuidSchema = z.string().uuid();

const AdminLabelSchema = z.string().min(1).max(200);

// Bound copied from `schemas/admin-content.ts` (private there). A badge slug is the key `RewardLedger` and the rewards engine use, not a URL segment.
const BadgeSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumeric words separated by single hyphens",
  );

// Rejects `{}` on a `PATCH`; restated from `admin-content.ts`, where it is private.
const atLeastOneField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  // `refine` hands back an unresolved `z.infer<TSchema>`; safe as every caller passes a `.partial()` object schema.
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

// Coerced from the query string's `"true"`; `z.boolean()` would reject the flag.
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

// `title` is an internal label, nullable because an untitled quiz on one lesson is ordinary; the copy lives in the questions.
export const QuizCreateSchema = z
  .object({ title: AdminLabelSchema.nullable().optional() })
  .strict();

export const QuizUpdateSchema = atLeastOneField(
  z.object({ title: AdminLabelSchema.nullable() }).partial().strict(),
);

export type QuizCreateBody = z.infer<typeof QuizCreateSchema>;
export type QuizUpdateBody = z.infer<typeof QuizUpdateSchema>;

export const QuestionUpsertSchema = z
  .object({ format: QuizQuestionTypeSchema, definition: z.unknown() })
  .strict();

export type QuestionUpsertBody = z.infer<typeof QuestionUpsertSchema>;

export const ActivityUpsertSchema = z
  .object({ type: ActivityTypeSchema, definition: z.unknown() })
  .strict();

export type ActivityUpsertBody = z.infer<typeof ActivityUpsertSchema>;

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
