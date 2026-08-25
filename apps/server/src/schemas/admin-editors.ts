/**
 * Route-boundary schemas for the guided editors (file 33, FR-CMS-03, FR-GAM-04).
 *
 * The rules from `schemas/admin-content.ts` carry over unchanged: no `status` key
 * anywhere (`POST /{id}/transition` is the only door), no `sortOrder` key (a
 * question's position is owned by its create order and by delete renumbering),
 * and `.strict()` on everything.
 *
 * ## Why `definition` is `z.unknown()` here
 *
 * It is **not** unvalidated. The payload is parsed with the *specific* member of
 * the shared union that `format` (or `type`) names — see
 * `services/adminEditorService.ts` — rather than with the union itself, and that
 * is the difference between a useful error and a useless one. Zod reports a failed
 * `z.union` as one `invalid_union` issue at the root; `flatten()` turns that into
 * `{ definition: ["Invalid input"] }`, which tells an author nothing. Parsing
 * against `McqQuestionSchema` instead yields `prompt.bn: Required` — the field
 * that is actually wrong.
 *
 * It also makes the format/definition agreement check free: the member schema
 * carries `type: z.literal("mcq")`, so a `match_pair` payload submitted as `mcq`
 * fails on that literal rather than needing a hand-written comparison.
 *
 * The consequence for the published document is that the request body cannot show
 * the payload shape inline, so each operation's description points at the
 * registered `QuizQuestion` / `ActivityDefinition` component schema instead
 * (`backend.md §7`).
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

// --- Params ---------------------------------------------------------------

export const QuizIdParamsSchema = z.object({ quizId: UuidSchema }).strict();

export const QuestionParamsSchema = z
  .object({ quizId: UuidSchema, id: UuidSchema })
  .strict();

export const EditorIdParamsSchema = z.object({ id: UuidSchema }).strict();

export type QuizIdParams = z.infer<typeof QuizIdParamsSchema>;
export type QuestionParams = z.infer<typeof QuestionParamsSchema>;

// --- Lists ----------------------------------------------------------------

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

// --- Quizzes --------------------------------------------------------------

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

/**
 * A whole question, create or replace.
 *
 * There is no partial edit of a question and there should not be: a definition is
 * one payload whose parts cross-validate — `correctOptionId` has to name an
 * option that is still in `options` — so merging a fragment into a stored payload
 * would produce a shape neither the author nor the schema ever saw as a whole.
 * The editor holds the entire form state anyway and submits all of it.
 */
export const QuestionUpsertSchema = z
  .object({ format: QuizQuestionTypeSchema, definition: z.unknown() })
  .strict();

export type QuestionUpsertBody = z.infer<typeof QuestionUpsertSchema>;

// --- Activities -----------------------------------------------------------

export const ActivityUpsertSchema = z
  .object({ type: ActivityTypeSchema, definition: z.unknown() })
  .strict();

export type ActivityUpsertBody = z.infer<typeof ActivityUpsertSchema>;

// --- Badges ---------------------------------------------------------------

/**
 * A badge (FR-GAM-04).
 *
 * `rule` is `z.unknown()` at the boundary and validated in the service against
 * `BADGE_RULE_SCHEMAS[ruleType]`, for the same reason the definitions are: the
 * schema to apply is chosen by a sibling field, and the `.strict()` member is
 * what turns a stray `topicSlug` on a `streak_days` badge into a `400` naming the
 * key rather than a silently dropped parameter.
 *
 * Free-form JSON editing is deliberately not offered — the CMS renders a fieldset
 * per rule type. An admin who could type arbitrary JSON here would be able to
 * author a badge the engine warns about and no child can ever earn.
 */
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

/**
 * `ruleType` and `rule` travel together or not at all.
 *
 * A `rule` without its type cannot be validated against anything, and a type
 * without its rule would leave the stored payload describing the previous rule —
 * either way the badge silently stops meaning what the row says. Restated in the
 * OpenAPI description, since refinements are dropped in conversion.
 */
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
