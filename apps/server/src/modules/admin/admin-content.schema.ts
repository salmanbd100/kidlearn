/**
 * Route-boundary schemas for `/api/admin/content/*` (file 32, `backend.md §2`).
 */
import {
  ContentStatusSchema,
  GradeLevelSchema,
  PaletteSchema,
} from "@kidlearn/types";
import { z } from "zod";

/**
 * Re-exported rather than rebuilt from `GRADE_LEVELS`: the same enum the child
 * API validates against, so the two cannot disagree about what a grade is. Same
 * pattern as `schemas/children.ts`.
 */
export const AdminGradeLevelSchema = GradeLevelSchema;

/** A slug an admin types: URL-safe, lowercase, and stable once content ships. */
const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumeric words separated by single hyphens",
  );

/** The internal label a CMS list and an audit trail are built from. */
const AdminLabelSchema = z.string().min(1).max(200);

/** At least one grade: content no grade can see is content nobody can see. */
const GradeLevelsSchema = z.array(AdminGradeLevelSchema).min(1);

const LocalizedNameSchema = z
  .object({ en: z.string().min(1).max(200), bn: z.string().min(1).max(200) })
  .strict();

/** A lesson's per-locale content: what a child reads and hears. */
const LessonTranslationSchema = z
  .object({
    title: z.string().min(1).max(200),
    introScript: z.string().min(1).max(2000),
    videoAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();

const LessonTranslationsSchema = z
  .object({ en: LessonTranslationSchema, bn: LessonTranslationSchema })
  .strict();

/** Every `/api/admin/content/:resource/:id` path. */
export const AdminContentIdParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export type AdminContentIdParams = z.infer<typeof AdminContentIdParamsSchema>;

/**
 * `?includeArchived=true` opts an admin list into showing archived rows, which
 * are hidden by default (requirement 5).
 */
const IncludeArchivedSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export const AdminContentListQuerySchema = z
  .object({ includeArchived: IncludeArchivedSchema })
  .strict();

export const AdminTopicListQuerySchema = z
  .object({
    includeArchived: IncludeArchivedSchema,
    subjectId: z.string().uuid().optional(),
  })
  .strict();

export const AdminLessonListQuerySchema = z
  .object({
    includeArchived: IncludeArchivedSchema,
    topicId: z.string().uuid().optional(),
    worldId: z.string().uuid().optional(),
  })
  .strict();

export type AdminContentListQuery = z.infer<typeof AdminContentListQuerySchema>;
export type AdminTopicListQuery = z.infer<typeof AdminTopicListQuerySchema>;
export type AdminLessonListQuery = z.infer<typeof AdminLessonListQuerySchema>;

export const WorldCreateSchema = z
  .object({
    slug: SlugSchema,
    name: AdminLabelSchema,
    palette: PaletteSchema,
    mascotAssetId: z.string().uuid().nullable().optional(),
    translations: LocalizedNameSchema,
  })
  .strict();

export const SubjectCreateSchema = z
  .object({
    slug: SlugSchema,
    name: AdminLabelSchema,
    gradeLevels: GradeLevelsSchema,
    translations: LocalizedNameSchema,
  })
  .strict();

export const TopicCreateSchema = z
  .object({
    subjectId: z.string().uuid(),
    slug: SlugSchema,
    name: AdminLabelSchema,
    gradeLevels: GradeLevelsSchema,
    translations: LocalizedNameSchema,
  })
  .strict();

/** A lesson's authored shape (FR-CMS-01). */
export const LessonCreateSchema = z
  .object({
    topicId: z.string().uuid(),
    worldId: z.string().uuid(),
    slug: SlugSchema,
    title: AdminLabelSchema,
    gradeLevels: GradeLevelsSchema,
    conceptsIntroduced: z
      .array(
        z
          .string()
          .regex(
            /^(letter|word|number):.+$/,
            "concept must be prefixed `letter:`, `word:` or `number:`",
          ),
      )
      .max(50)
      .optional(),
    activityId: z.string().uuid().nullable().optional(),
    quizId: z.string().uuid().nullable().optional(),
    translations: LessonTranslationsSchema,
  })
  .strict();

/**
 * Edits are the create shape with every field optional, minus the parent
 * pointers — a topic does not change subject and a lesson does not change topic
 * by editing a field. Moving content between parents is a deliberate operation
 * with reordering consequences on both sides, and it is not in this file's scope.
 */
const atLeastOneField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  // `refine` hands back `z.infer<TSchema>`, which is unresolved while `TSchema`
  // is still a parameter, so `Object.keys` has nothing concrete to accept. Safe
  // because every caller passes a `.partial()` object schema — the cast asserts
  // the constraint the generic cannot express, not a narrowing of unknown data.
  schema.refine((value) => Object.keys(value as object).length > 0, {
    message: "Provide at least one field to update",
  });

export const WorldUpdateSchema = atLeastOneField(
  WorldCreateSchema.partial().strict(),
);

export const SubjectUpdateSchema = atLeastOneField(
  SubjectCreateSchema.partial().strict(),
);

export const TopicUpdateSchema = atLeastOneField(
  TopicCreateSchema.omit({ subjectId: true }).partial().strict(),
);

export const LessonUpdateSchema = atLeastOneField(
  LessonCreateSchema.omit({ topicId: true }).partial().strict(),
);

export type WorldCreateBody = z.infer<typeof WorldCreateSchema>;
export type SubjectCreateBody = z.infer<typeof SubjectCreateSchema>;
export type TopicCreateBody = z.infer<typeof TopicCreateSchema>;
export type LessonCreateBody = z.infer<typeof LessonCreateSchema>;
export type WorldUpdateBody = z.infer<typeof WorldUpdateSchema>;
export type SubjectUpdateBody = z.infer<typeof SubjectUpdateSchema>;
export type TopicUpdateBody = z.infer<typeof TopicUpdateSchema>;
export type LessonUpdateBody = z.infer<typeof LessonUpdateSchema>;

/** The only body in the API that names a `ContentStatus`. */
export const TransitionSchema = z.object({ to: ContentStatusSchema }).strict();

export type TransitionBody = z.infer<typeof TransitionSchema>;

/** A whole sibling set in the order it should hold (requirement 4). */
export const ReorderSchema = z
  .object({
    parentId: z.string().uuid().optional(),
    orderedIds: z.array(z.string().uuid()).min(1).max(500),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export type ReorderBody = z.infer<typeof ReorderSchema>;

/** A recurring character's stable visual description. */
export const CharacterSheetCreateSchema = z
  .object({
    slug: SlugSchema.optional(),
    name: AdminLabelSchema,
    worldId: z.string().uuid().nullable().default(null),
    description: z.string().min(20).max(2000),
  })
  .strict();

export type CharacterSheetCreateBody = z.infer<
  typeof CharacterSheetCreateSchema
>;

export const CharacterSheetUpdateSchema = atLeastOneField(
  CharacterSheetCreateSchema.omit({ slug: true }).partial().strict(),
);

export type CharacterSheetUpdateBody = z.infer<
  typeof CharacterSheetUpdateSchema
>;

/**
 * `?worldId=` narrows the list to that world **plus the world-less sheets**, not
 * to an exact match — it is the set the illustration generator applies to a story
 * set there, and a filter that answered differently would show an admin a cast
 * their pictures do not use.
 */
export const CharacterSheetListQuerySchema = z
  .object({ worldId: z.string().uuid().optional() })
  .strict();

export type CharacterSheetListQuery = z.infer<
  typeof CharacterSheetListQuerySchema
>;

/**
 * Promote a story generation's cast into sheets — the "Save as character sheet"
 * action (FR-AI-09).
 */
export const PromoteJobCharactersSchema = z
  .object({ jobId: z.string().uuid() })
  .strict();

export type PromoteJobCharactersBody = z.infer<
  typeof PromoteJobCharactersSchema
>;
