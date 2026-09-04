import { z } from "zod";
import { GradeLevelSchema } from "./children.js";
import { PaletteSchema } from "./content.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/admin/content/*` — the curriculum as an **author** sees it (file 32,
 * FR-CURR-04, FR-CMS-01, FR-CMS-06).
 */
export const CONTENT_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "published",
  "archived",
] as const;
export const ContentStatusSchema = z.enum(CONTENT_STATUSES);
export type ContentStatusValue = z.infer<typeof ContentStatusSchema>;

/** The four resources the CMS manages, spelled as they appear in the path. */
export const CONTENT_RESOURCES = [
  "worlds",
  "subjects",
  "topics",
  "lessons",
] as const;
export const ContentResourceSchema = z.enum(CONTENT_RESOURCES);
export type ContentResourceName = z.infer<typeof ContentResourceSchema>;

/**
 * The three that carry a `sortOrder` column, and can therefore be reordered.
 */
export const ORDERABLE_CONTENT_RESOURCES = [
  "subjects",
  "topics",
  "lessons",
] as const;
export const OrderableContentResourceSchema = z.enum(
  ORDERABLE_CONTENT_RESOURCES,
);
export type OrderableContentResourceName = z.infer<
  typeof OrderableContentResourceSchema
>;

/** The publishing workflow, as data (FR-CMS-06). */
export const ALLOWED_CONTENT_TRANSITIONS: Record<
  ContentStatusValue,
  readonly ContentStatusValue[]
> = {
  draft: ["in_review", "archived"],
  in_review: ["approved", "rejected", "draft"],
  approved: ["published", "draft"],
  rejected: ["draft", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

/** The legal next states for a status, as a fresh array. */
export function nextContentStatuses(
  from: ContentStatusValue,
): ContentStatusValue[] {
  return [...ALLOWED_CONTENT_TRANSITIONS[from]];
}

/** Whether a row's content may be rewritten at its current status. */
export function isContentEditable(status: ContentStatusValue): boolean {
  return status !== "published";
}

/** The audit stamp on every curriculum row (requirement 6). */
const AuditFieldsSchema = z.object({
  updatedBy: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

/** Both locales, always — an author edits the pair (FR-I18N-01). */
export const LocalizedNameSchema = z
  .object({ en: z.string(), bn: z.string() })
  .strict();

export const AdminWorldSchema = AuditFieldsSchema.extend({
  id: z.string(),
  slug: z.string(),
  /** The internal label, distinct from `translations` — see `World.name`. */
  name: z.string(),
  palette: PaletteSchema,
  mascotAssetId: z.string().nullable(),
  status: ContentStatusSchema,
  translations: LocalizedNameSchema,
}).strict();

export type AdminWorld = z.infer<typeof AdminWorldSchema>;

export const AdminSubjectSchema = AuditFieldsSchema.extend({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  /**
   * Position among siblings, written only by `PATCH /subjects/reorder`. Contiguous
   * from 0 after any reorder; a row created since may share the tail index until
   * the next one.
   */
  sortOrder: z.number().int(),
  gradeLevels: z.array(GradeLevelSchema),
  status: ContentStatusSchema,
  translations: LocalizedNameSchema,
}).strict();

export type AdminSubject = z.infer<typeof AdminSubjectSchema>;

export const AdminTopicSchema = AuditFieldsSchema.extend({
  id: z.string(),
  subjectId: z.string(),
  slug: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  gradeLevels: z.array(GradeLevelSchema),
  status: ContentStatusSchema,
  translations: LocalizedNameSchema,
}).strict();

export type AdminTopic = z.infer<typeof AdminTopicSchema>;

/** A lesson's per-locale content, as the lesson form edits it. */
export const AdminLessonTranslationSchema = z
  .object({
    title: z.string(),
    introScript: z.string(),
    /** `MediaAsset.id`, or `null` until the media library (file 33) fills it in. */
    videoAssetId: z.string().nullable(),
  })
  .strict();

export const AdminLessonSchema = AuditFieldsSchema.extend({
  id: z.string(),
  topicId: z.string(),
  worldId: z.string(),
  slug: z.string(),
  /** The internal label. Per-locale titles live under `translations`. */
  title: z.string(),
  sortOrder: z.number().int(),
  gradeLevels: z.array(GradeLevelSchema),
  status: ContentStatusSchema,
  activityId: z.string().nullable(),
  quizId: z.string().nullable(),
  /** Prefixed tokens the weekly report unions across a week (file 30). */
  conceptsIntroduced: z.array(z.string()),
  translations: z
    .object({
      en: AdminLessonTranslationSchema,
      bn: AdminLessonTranslationSchema,
    })
    .strict(),
}).strict();

export type AdminLesson = z.infer<typeof AdminLessonSchema>;

export const AdminWorldResponseSchema = ok(AdminWorldSchema);
export const AdminWorldListResponseSchema = ok(z.array(AdminWorldSchema));
export const AdminSubjectResponseSchema = ok(AdminSubjectSchema);
export const AdminSubjectListResponseSchema = ok(z.array(AdminSubjectSchema));
export const AdminTopicResponseSchema = ok(AdminTopicSchema);
export const AdminTopicListResponseSchema = ok(z.array(AdminTopicSchema));
export const AdminLessonResponseSchema = ok(AdminLessonSchema);
export const AdminLessonListResponseSchema = ok(z.array(AdminLessonSchema));

export type AdminWorldResponse = z.infer<typeof AdminWorldResponseSchema>;
export type AdminSubjectResponse = z.infer<typeof AdminSubjectResponseSchema>;
export type AdminTopicResponse = z.infer<typeof AdminTopicResponseSchema>;
export type AdminLessonResponse = z.infer<typeof AdminLessonResponseSchema>;

/** What a reorder answers with: the siblings, in their new order. */
export const ReorderedIdsSchema = z
  .object({ orderedIds: z.array(z.string()) })
  .strict();

export const ReorderedIdsResponseSchema = ok(ReorderedIdsSchema);
export type ReorderedIds = z.infer<typeof ReorderedIdsSchema>;

/**
 * A character sheet — the stable visual description of one recurring character
 * (file 36, FR-AI-09).
 */
export const CharacterSheetSchema = z
  .object({
    id: z.string(),
    /** Stable and not editable — it is how an import recognises a saved character. */
    slug: z.string(),
    name: z.string(),
    /** `null` for a character used across every world — a narrator, a child. */
    worldId: z.string().nullable(),
    description: z.string(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

/** The result of promoting a story generation's cast into sheets. */
export const PromotedCharacterSheetsSchema = z
  .object({
    created: z.array(CharacterSheetSchema),
    skipped: z.number().int().nonnegative(),
  })
  .strict();

export type PromotedCharacterSheets = z.infer<
  typeof PromotedCharacterSheetsSchema
>;

export const CharacterSheetResponseSchema = ok(CharacterSheetSchema);
export const CharacterSheetListResponseSchema = ok(
  z.array(CharacterSheetSchema),
);
export const PromotedCharacterSheetsResponseSchema = ok(
  PromotedCharacterSheetsSchema,
);
