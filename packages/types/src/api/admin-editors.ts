import { z } from "zod";
import {
  ActivityDefinitionSchema,
  ActivityTypeSchema,
} from "../activity/schemas.js";
import { BadgeRuleSchema, BadgeRuleTypeSchema } from "../badges.js";
import { QuizQuestionSchema, QuizQuestionTypeSchema } from "../quiz/schemas.js";
import { ContentStatusSchema } from "./admin-content.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/admin/content/{quizzes,activities,badges}` — the guided editors
 * (file 33, FR-CMS-03, FR-GAM-04).
 *
 * **The `definition` fields carry the shared payload schemas, not `unknown`.**
 * That is the point of these responses: the admin API validated the JSONB with
 * `QuizQuestionSchema` / `ActivityDefinitionSchema` on the way in, so a route
 * test asserting a response against this schema proves the round trip — what came
 * back out of Postgres still parses as the thing the engines in files 18–22 will
 * be handed. A response schema of `z.unknown()` there would document nothing and
 * catch nothing.
 *
 * These sit apart from `./admin-content.ts` because they are a different kind of
 * thing. That file is the curriculum *hierarchy* — rows with slugs, parents,
 * ordering and per-locale names. A quiz question has none of those: its text is
 * inside its payload, in both locales, because the engine that renders it does
 * its own locale picking.
 */

/**
 * The three resources the editors manage, spelled as they appear in the path.
 *
 * Deliberately separate from `CONTENT_RESOURCES`. That union is the curriculum
 * hierarchy — every member has a slug, a parent and per-locale names, and the
 * reorder and translation machinery keyed to it assumes all three. A quiz has none
 * of them, and widening the union would have made the four existing resources'
 * guarantees conditional.
 *
 * Shared rather than respelled on each side, for the same reason
 * `CONTENT_RESOURCES` is: this union *is* the path segment on the wire, so the
 * client, the router and the OpenAPI registration are talking about the same three
 * strings.
 */
export const EDITOR_CONTENT_RESOURCES = [
  "quizzes",
  "activities",
  "badges",
] as const;
export const EditorContentResourceSchema = z.enum(EDITOR_CONTENT_RESOURCES);
export type EditorContentResourceName = z.infer<
  typeof EditorContentResourceSchema
>;

/** A quiz container. `title` is an internal label — the questions carry the copy. */
export const AdminQuizSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    status: ContentStatusSchema,
    /** How many questions it holds, so a list needs no second request. */
    questionCount: z.number().int(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type AdminQuiz = z.infer<typeof AdminQuizSchema>;

export const AdminQuizQuestionSchema = z
  .object({
    id: z.string(),
    quizId: z.string(),
    /**
     * The enum column. It repeats `definition.type`, and the write path rejects a
     * pair that disagrees — two sources of truth for one decision, which is why
     * the server refuses to store them out of step (see `contentService`'s
     * `assertDiscriminatorAgrees` for what the student API does about it).
     */
    format: QuizQuestionTypeSchema,
    schemaVersion: z.number().int(),
    sortOrder: z.number().int(),
    definition: QuizQuestionSchema,
  })
  .strict();

export type AdminQuizQuestion = z.infer<typeof AdminQuizQuestionSchema>;

/** One quiz with its questions in order — what the editor page loads. */
export const AdminQuizDetailSchema = AdminQuizSchema.extend({
  questions: z.array(AdminQuizQuestionSchema),
}).strict();

export type AdminQuizDetail = z.infer<typeof AdminQuizDetailSchema>;

export const AdminActivitySchema = z
  .object({
    id: z.string(),
    /** Mirrors `definition.type`, under the same rule as a question's `format`. */
    type: ActivityTypeSchema,
    schemaVersion: z.number().int(),
    status: ContentStatusSchema,
    definition: ActivityDefinitionSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type AdminActivity = z.infer<typeof AdminActivitySchema>;

/**
 * A badge, as the manager edits it (FR-GAM-04).
 *
 * No timestamps: `Badge` has no `createdAt`/`updatedAt` columns, and no
 * `updatedBy` either — the audit stamp file 32 added to the curriculum models was
 * not added here. Absent rather than faked, so the document does not promise a
 * history the database cannot produce.
 */
export const AdminBadgeSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    ruleType: BadgeRuleTypeSchema,
    rule: BadgeRuleSchema,
    iconAssetId: z.string().nullable(),
    status: ContentStatusSchema,
  })
  .strict();

export type AdminBadge = z.infer<typeof AdminBadgeSchema>;

export const AdminQuizResponseSchema = ok(AdminQuizSchema);
export const AdminQuizListResponseSchema = ok(z.array(AdminQuizSchema));
export const AdminQuizDetailResponseSchema = ok(AdminQuizDetailSchema);
export const AdminQuizQuestionResponseSchema = ok(AdminQuizQuestionSchema);
export const AdminActivityResponseSchema = ok(AdminActivitySchema);
export const AdminActivityListResponseSchema = ok(z.array(AdminActivitySchema));
export const AdminBadgeResponseSchema = ok(AdminBadgeSchema);
export const AdminBadgeListResponseSchema = ok(z.array(AdminBadgeSchema));

/**
 * What a delete answers with — the id that is gone, and the remaining questions
 * in their re-numbered order.
 *
 * Not `204`: removing a question renumbers its siblings' `sortOrder`, so the
 * client's list is stale the moment the delete succeeds. Returning the survivors
 * is what lets the editor settle rather than guess, and it is the same reasoning
 * `ReorderedIds` is returned for.
 */
export const QuestionDeletedSchema = z
  .object({
    id: z.string(),
    remainingIds: z.array(z.string()),
  })
  .strict();

export const QuestionDeletedResponseSchema = ok(QuestionDeletedSchema);
export type QuestionDeleted = z.infer<typeof QuestionDeletedSchema>;
