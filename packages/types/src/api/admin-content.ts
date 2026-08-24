import { z } from "zod";
import { GradeLevelSchema } from "./children.js";
import { PaletteSchema } from "./content.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/admin/content/*` — the curriculum as an **author** sees it (file 32,
 * FR-CURR-04, FR-CMS-01, FR-CMS-06).
 *
 * Read this next to `api/content.ts`, which is the same curriculum as a *child*
 * sees it. The two differ in three ways, and every one of them is deliberate:
 *
 *  1. **Text is not resolved.** A student response carries one string in the
 *     child's language; these carry both locales, because an author edits both
 *     and a CMS that showed only one would make the other unmaintainable.
 *  2. **Nothing is filtered by status.** The student API returns `published` rows
 *     and nothing else — that is the content-safety guard (`backend.md §4`). This
 *     API exists precisely to show drafts, and every payload here carries the
 *     `status` that decides whether a child can see the row.
 *  3. **Ids are exposed.** `activityId`, `quizId`, `videoAssetId`,
 *     `mascotAssetId` are join keys a child's client has no use for and an
 *     author's editor cannot work without.
 *
 * `CONTENT_STATUSES` mirrors Prisma's `ContentStatus` by hand, because this
 * package may not depend on `@kidlearn/db` (see `../index.ts`). The mirror is
 * checked rather than trusted: `apps/server/src/openapi/paths/admin-content.ts`
 * carries a compile-time assertion that the two still agree, so adding a status
 * to the schema without adding it here fails `pnpm typecheck`.
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

/**
 * The four resources the CMS manages, spelled as they appear in the path.
 *
 * Shared rather than respelled on each side: this union *is* the path segment on
 * the wire, so the client, the router and the OpenAPI registration are all
 * talking about the same four strings. A copy in `apps/web` that gained a fifth
 * resource before the server did would compile and 404 at runtime.
 */
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
 *
 * `World` is absent: worlds are chosen on a map, not read in sequence, so there
 * is no column for a reorder to write.
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

/**
 * The publishing workflow, as data (FR-CMS-06).
 *
 * **Shared rather than mirrored, deliberately.** This file's spec suggested the
 * CMS keep its own copy of the matrix so the transition buttons could be derived
 * client-side. A copy is a thing that drifts, and the failure it produces is a
 * button an admin clicks and a `409` they cannot act on. One definition, imported
 * by both sides, makes that impossible: the client can only offer hops the server
 * will accept, and the server stays the authority regardless — it applies this
 * same table to the row's *actual* status, which a client cannot know is current.
 *
 * `apps/server/src/services/contentStatusService.ts` re-types this against
 * Prisma's `ContentStatus`, which fails to compile if the two enums ever diverge.
 *
 * Three properties are the point of the table:
 *
 *  - `published` is reachable from `approved` and nowhere else, so nothing skips
 *    a reviewer.
 *  - `rejected` leads only to `draft` or `archived`: rejected work is re-reviewed,
 *    never un-rejected.
 *  - The diagonal is empty — a status cannot transition to itself, which would
 *    re-stamp the audit trail with a review step nobody performed.
 */
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

/**
 * The legal next states for a status, as a fresh array.
 *
 * A copy rather than the stored array: the CMS renders this list, and a caller
 * mutating it would widen the matrix for every later use in the process — adding
 * a button the server refuses.
 */
export function nextContentStatuses(
  from: ContentStatusValue,
): ContentStatusValue[] {
  return [...ALLOWED_CONTENT_TRANSITIONS[from]];
}

/**
 * Whether a row's content may be rewritten at its current status.
 *
 * The matrix above guards the *act* of publishing; this guards the content that
 * stays published afterwards. Without it a `PATCH` rewriting a live lesson's
 * title and intro script reaches a five-year-old without passing a reviewer
 * again — the matrix never sees the edit, because the status never moved.
 *
 * Withdrawing first (`published → draft`) is the door instead: the removal from
 * students is explicit rather than a side effect of an edit, and the rewrite
 * comes back through `draft → in_review → approved → published`. That is more
 * clicks, and the clicks are the point — file 37 layers AI-generated edits on
 * this same API, where "an edit is not a publish" stops being true by inspection.
 *
 * Shared with the CMS for the reason `ALLOWED_CONTENT_TRANSITIONS` is: the Edit
 * button and the server's refusal come from one definition, so the client cannot
 * offer an edit the server will reject.
 */
export function isContentEditable(status: ContentStatusValue): boolean {
  return status !== "published";
}

/**
 * The audit stamp on every curriculum row (requirement 6).
 *
 * `updatedBy` is the acting `AdminUser.id`, or `null` for a row written by a seed
 * or predating the column. Deliberately the raw id and not a name: it is not a
 * foreign key — an audit stamp has to survive the account that made it — so there
 * is no row to join to once an admin is gone, and inventing "Unknown admin"
 * server-side would hide that distinction from the person reading the history.
 */
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

/**
 * What a reorder answers with: the siblings, in their new order.
 *
 * The whole set rather than `{ ok: true }`, because the client has just guessed
 * the outcome optimistically for the drag animation and this is what lets it
 * settle on the server's answer instead of its own.
 */
export const ReorderedIdsSchema = z
  .object({ orderedIds: z.array(z.string()) })
  .strict();

export const ReorderedIdsResponseSchema = ok(ReorderedIdsSchema);
export type ReorderedIds = z.infer<typeof ReorderedIdsSchema>;
