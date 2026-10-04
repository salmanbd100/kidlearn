/** Route-boundary schemas for `/api/admin/ai/*` (file 34, FR-AI-01). */
import {
  AiJobStatusSchema,
  AiJobTypeSchema,
  GradeLevelSchema,
  LocaleSchema,
} from "@kidlearn/types";
import { z } from "zod";

/**
 * The generator requests are defined in `@kidlearn/types`, where `apps/web` reads
 * their inferred types; re-exported here so every route and the OpenAPI document
 * keep importing them from the module, as `backend.md §7` has it.
 */
export {
  type GenerateLessonBody,
  GenerateLessonSchema,
  type GenerateNarrationBody,
  GenerateNarrationSchema,
  type GenerateQuizBody,
  GenerateQuizSchema,
  type GenerateStoryBody,
  GenerateStorySchema,
} from "@kidlearn/types";

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
