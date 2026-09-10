/** Route-boundary schemas for `/api/admin/ai/*` (file 34, FR-AI-01). */
import {
  AiJobStatusSchema,
  AiJobTypeSchema,
  GradeLevelSchema,
  LocaleSchema,
  NarrationEntitySchema,
} from "@kidlearn/types";
import { z } from "zod";

/** What the generator is asked for. */
export const GenerateLessonSchema = z
  .object({
    gradeLevel: GradeLevelSchema,
    subjectId: z.string().uuid(),
    topicId: z.string().uuid(),
    worldId: z.string().uuid().optional(),
    lessonFocus: z.string().min(3).max(200),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
  })
  .strict();

export type GenerateLessonBody = z.infer<typeof GenerateLessonSchema>;

/** What the story generator is asked for (file 35, FR-AI-02). */
export const GenerateStorySchema = z
  .object({
    gradeLevels: z
      .array(GradeLevelSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "gradeLevels must not repeat",
      ),
    theme: z.string().min(3).max(200),
    worldId: z.string().uuid(),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
    pageCount: z.number().int().min(6).max(8).optional(),
  })
  .strict();

export type GenerateStoryBody = z.infer<typeof GenerateStorySchema>;

/** What the quiz generator is asked for (file 35, FR-AI-03). */
export const GenerateQuizSchema = z
  .object({
    lessonId: z.string().uuid(),
    count: z.number().int().min(3).max(5).optional(),
    languages: z
      .array(LocaleSchema)
      .min(1)
      .refine(
        (values) => new Set(values).size === values.length,
        "languages must not repeat",
      ),
  })
  .strict();

export type GenerateQuizBody = z.infer<typeof GenerateQuizSchema>;

/** Which content to narrate (file 36, FR-AI-04, FR-I18N-05). */
export const GenerateNarrationSchema = z
  .object({ entity: NarrationEntitySchema, id: z.string().uuid() })
  .strict();

export type GenerateNarrationBody = z.infer<typeof GenerateNarrationSchema>;

/** Which story to illustrate (file 36, FR-AI-05, FR-AI-09). */
export const GenerateIllustrationsSchema = z
  .object({ storyId: z.string().uuid() })
  .strict();

export type GenerateIllustrationsBody = z.infer<
  typeof GenerateIllustrationsSchema
>;

/** Which jobs to list. */
const PositiveIntSchema = z.coerce.number().int().min(1);

export const AiJobListQuerySchema = z
  .object({
    status: AiJobStatusSchema.optional().default("awaiting_review"),
    type: AiJobTypeSchema.optional(),
    language: LocaleSchema.optional(),
    gradeLevel: GradeLevelSchema.optional(),
    take: PositiveIntSchema.max(100).optional().default(25),
    skip: z.coerce.number().int().min(0).optional().default(0),
  })
  .strict();

export type AiJobListQuery = z.infer<typeof AiJobListQuerySchema>;

export const AiJobIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export type AiJobIdParams = z.infer<typeof AiJobIdParamsSchema>;

/** Why the reviewer refused (FR-AI-08). */
export const RejectJobSchema = z
  .object({ reason: z.string().trim().min(10).max(2000) })
  .strict();

export type RejectJobBody = z.infer<typeof RejectJobSchema>;

/**
 * `?jobId=…` on a content or editor mutation — the edit-then-approve breadcrumb
 * (requirement 5).
 */
export const JobBreadcrumbQuerySchema = z
  .object({ jobId: z.string().uuid().optional() })
  .strict();

export type JobBreadcrumbQuery = z.infer<typeof JobBreadcrumbQuerySchema>;
