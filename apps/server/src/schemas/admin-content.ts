/**
 * Route-boundary schemas for `/api/admin/content/*` (file 32, `backend.md §2`).
 *
 * Three rules hold across every shape in this file, and each of them is load-
 * bearing rather than stylistic:
 *
 *  1. **No `status` key anywhere, and `.strict()` everywhere.** A status change is
 *     `POST /:id/transition` and nothing else, because that is the only path that
 *     runs the matrix in `services/contentStatusService.ts`. If a create or edit
 *     body could carry `status`, publishing would have a second door with no
 *     review behind it. `.strict()` is what turns "the field is not in the schema"
 *     into a `400` instead of a silently stripped key.
 *  2. **No `sortOrder` key either.** Ordering is owned by
 *     `PATCH /:resource/reorder`, which writes a whole sibling set in one
 *     transaction. Letting a create or an edit set one row's position is how two
 *     rows end up sharing an index and the tree renders in an order nobody chose.
 *  3. **Translations arrive complete or not at all.** Both locales are required
 *     whenever `translations` is present, including on a `PATCH`. A partial write
 *     is what produces a lesson that falls back to English mid-way through a
 *     Bangla learner's session (FR-I18N-01), and the CMS form submits both fields
 *     together in any case.
 *
 * Grades are the uppercase Prisma spelling. This file's spec wrote
 * `nursery | kg1 | kg2`, but `GradeLevel` shipped in file 03 as
 * `NURSERY | KG1 | KG2` and `/api/children` already speaks it — see the casing
 * note in `schemas/children.ts`.
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

/**
 * A lesson's per-locale content: what a child reads and hears.
 *
 * `videoAssetId` is nullable and optional because file 33 owns the media library
 * — a lesson is authored, reviewed and only then given its video. It is an id
 * rather than the URL this file's spec sketched, because `MediaAsset` is where a
 * URL lives in the settled schema (file 04) and a lesson holding a loose string
 * would be a second, unmanaged copy of it.
 */
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

// --- Lists ----------------------------------------------------------------

/**
 * `?includeArchived=true` opts an admin list into showing archived rows, which
 * are hidden by default (requirement 5).
 *
 * Archiving is how content is retired, and a CMS that shows every retirement
 * forever is a CMS an admin stops reading. Coerced rather than parsed as a
 * boolean: a query string carries `"true"`, and `z.boolean()` would reject every
 * request that used the flag.
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

// --- Creates and edits ----------------------------------------------------

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

/**
 * A lesson's authored shape (FR-CMS-01).
 *
 * `activityId` and `quizId` are nullable and optional for the same reason
 * `videoAssetId` is: the editors that produce them arrive with file 33, and a
 * lesson has to be draftable before its parts exist.
 *
 * `conceptsIntroduced` are the prefixed tokens the weekly report unions across a
 * week (`letter:A`, `word:apple`, `number:7`, file 30). The prefix is validated
 * here because a typo produces a token no report will ever match and no error
 * anyone will ever see.
 */
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
 *
 * `.strict()` on the partial is what rejects `{ "status": "published" }` with a
 * `400`. The refinement below rejects `{}`, which would otherwise be an edit that
 * stamps `updatedBy` while changing nothing.
 *
 * Zod refinements are dropped in JSON Schema conversion, so the "at least one
 * field" rule is restated in each operation's OpenAPI description
 * (`backend.md §7`).
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

// --- Transitions and ordering ---------------------------------------------

/**
 * The only body in the API that names a `ContentStatus`.
 *
 * Whether the hop is *legal* is not this schema's job — `assertTransition` owns
 * that, and answers `409` rather than `400`, because a rejected hop is about the
 * row's current state and not about the request being malformed.
 */
export const TransitionSchema = z.object({ to: ContentStatusSchema }).strict();

export type TransitionBody = z.infer<typeof TransitionSchema>;

/**
 * A whole sibling set in the order it should hold (requirement 4).
 *
 * The payload is every sibling, not the one that moved, because "put this at
 * index 3" is a claim about the other rows too and two of those requests racing
 * leaves duplicate indices. The service rejects a list that is not exactly the
 * sibling set — see `reorderContent`.
 *
 * `parentId` is optional only because top-level subjects have no parent; topics
 * and lessons require one, which the service enforces.
 *
 * `includeArchived` says which sibling set the payload claims to be, and has to
 * match the list the admin dragged: a tree loaded with archived rows shown sends
 * them too, and one loaded without does not. A body flag rather than a query
 * parameter because it is part of what the write asserts, not a filter on a read.
 */
export const ReorderSchema = z
  .object({
    parentId: z.string().uuid().optional(),
    orderedIds: z.array(z.string().uuid()).min(1).max(500),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export type ReorderBody = z.infer<typeof ReorderSchema>;

// --- Character sheets (file 36, FR-AI-09) ---------------------------------

/**
 * A recurring character's stable visual description.
 *
 * **`description` is prompt text, not notes**, which is why the floor is 20
 * characters rather than 1: "a rabbit" contributes nothing an image model can draw
 * consistently from, and a sheet that adds nothing makes the drift it was created
 * to stop look like the feature working. The ceiling is generous — colours,
 * clothing, size and distinguishing features are four sentences, not one.
 *
 * `slug` is optional on create and absent from the update body. It is how an
 * import recognises a character it has already saved, so a slug that could change
 * would let the same mascot be imported twice under two names. Omitted, it is
 * derived from `name` and suffixed until free.
 *
 * `worldId` is explicitly nullable rather than optional-and-absent, matching
 * `RegisterAssetSchema.language`: a character used across every world is a fact
 * worth recording, not a gap.
 *
 * No `status` and no `sortOrder`, for a different reason from the curriculum
 * bodies above — a sheet has neither. It is never student-facing, so there is
 * nothing to publish, and it is never listed in an order an admin chose.
 */
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
 *
 * Restated in the operation's OpenAPI description: JSON Schema cannot say what a
 * filter means.
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
 *
 * Just the job id. Which characters it describes, and which world they belong to,
 * are read from the job's own audit record and the story it wrote: a body that
 * could name the characters would be a way to write a description the model never
 * produced while the row still claimed a job as its provenance.
 */
export const PromoteJobCharactersSchema = z
  .object({ jobId: z.string().uuid() })
  .strict();

export type PromoteJobCharactersBody = z.infer<
  typeof PromoteJobCharactersSchema
>;
