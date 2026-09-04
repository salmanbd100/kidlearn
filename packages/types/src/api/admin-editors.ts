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
 */

/**
 * The three resources the editors manage, spelled as they appear in the path.
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

/** A badge, as the manager edits it (FR-GAM-04). */
export const AdminBadgeSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    ruleType: BadgeRuleTypeSchema,
    rule: BadgeRuleSchema,
    iconAssetId: z.string().nullable(),
    /** The icon's delivery url, resolved from `iconAssetId`. */
    iconUrl: z.string().nullable(),
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
 */
export const QuestionDeletedSchema = z
  .object({
    id: z.string(),
    remainingIds: z.array(z.string()),
  })
  .strict();

export const QuestionDeletedResponseSchema = ok(QuestionDeletedSchema);
export type QuestionDeleted = z.infer<typeof QuestionDeletedSchema>;
