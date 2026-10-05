import {
  AiJobStatusSchema,
  AiJobTypeSchema,
  GradeLevelSchema,
  LocaleSchema,
} from "@kidlearn/types";
import { z } from "zod";

// Defined in @kidlearn/types (apps/web reads them); re-exported so routes import from the module.
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

export const GenerateIllustrationsSchema = z
  .object({ storyId: z.string().uuid() })
  .strict();

export type GenerateIllustrationsBody = z.infer<
  typeof GenerateIllustrationsSchema
>;

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

export const RejectJobSchema = z
  .object({ reason: z.string().trim().min(10).max(2000) })
  .strict();

export type RejectJobBody = z.infer<typeof RejectJobSchema>;

// Edit-then-approve breadcrumb on content and editor mutations.
export const JobBreadcrumbQuerySchema = z
  .object({ jobId: z.string().uuid().optional() })
  .strict();

export type JobBreadcrumbQuery = z.infer<typeof JobBreadcrumbQuerySchema>;
