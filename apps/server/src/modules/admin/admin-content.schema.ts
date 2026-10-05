import {
  ContentStatusSchema,
  GradeLevelSchema,
  PaletteSchema,
} from "@kidlearn/types";
import { z } from "zod";

// Same enum the child API validates against, so the two cannot disagree on a grade.
export const AdminGradeLevelSchema = GradeLevelSchema;

const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug must be lowercase alphanumeric words separated by single hyphens",
  );

const AdminLabelSchema = z.string().min(1).max(200);

/** At least one grade: content no grade can see is content nobody can see. */
const GradeLevelsSchema = z.array(AdminGradeLevelSchema).min(1);

const LocalizedNameSchema = z
  .object({ en: z.string().min(1).max(200), bn: z.string().min(1).max(200) })
  .strict();

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

export const AdminContentIdParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export type AdminContentIdParams = z.infer<typeof AdminContentIdParamsSchema>;

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

// The create shape, all optional, minus parent pointers: moving content between parents is a separate operation.
const atLeastOneField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  // Cast: refine's z.infer<TSchema> is unresolved while TSchema is generic; every caller passes a
  // .partial() object schema, so this asserts a constraint the generic cannot express.
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

export const TransitionSchema = z.object({ to: ContentStatusSchema }).strict();

export type TransitionBody = z.infer<typeof TransitionSchema>;

export const ReorderSchema = z
  .object({
    parentId: z.string().uuid().optional(),
    orderedIds: z.array(z.string().uuid()).min(1).max(500),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export type ReorderBody = z.infer<typeof ReorderSchema>;

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

// `?worldId=` returns that world plus the world-less sheets, matching what the illustration generator
// applies to a story, so the list never shows a cast the pictures do not use.
export const CharacterSheetListQuerySchema = z
  .object({ worldId: z.string().uuid().optional() })
  .strict();

export type CharacterSheetListQuery = z.infer<
  typeof CharacterSheetListQuerySchema
>;

export const PromoteJobCharactersSchema = z
  .object({ jobId: z.string().uuid() })
  .strict();

export type PromoteJobCharactersBody = z.infer<
  typeof PromoteJobCharactersSchema
>;
