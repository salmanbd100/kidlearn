import { z } from "zod";
import { LessonStepSchema } from "../progress.js";
import { IsoDateTimeSchema, ok } from "./envelope.js";

/**
 * `/api/progress` — where the lesson player's progress is recorded (FR-LSN-06..07).
 */

/** One child's position in one lesson. */
export const LessonProgressSchema = z
  .object({
    lessonId: z.string(),
    currentStep: LessonStepSchema,
    /** Set once the reward step is reported complete. Survives every replay. */
    completedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type LessonProgressResponse = z.infer<typeof LessonProgressSchema>;

/** `null` when this child has never opened this lesson. */
export const LessonProgressReadResponseSchema = ok(
  z.object({ progress: LessonProgressSchema.nullable() }).strict(),
);

export const LessonProgressResponseSchema = ok(
  z.object({ progress: LessonProgressSchema }).strict(),
);

/** The acknowledgement of a recorded `SessionEvent`. */
export const SessionEventRecordSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    occurredAt: IsoDateTimeSchema,
  })
  .strict();

export type SessionEventRecordResponse = z.infer<
  typeof SessionEventRecordSchema
>;

export const SessionEventResponseSchema = ok(
  z.object({ event: SessionEventRecordSchema }).strict(),
);

/** What a submitted quiz was worth (FR-QUIZ-08). */
export const QuizScoreSchema = z
  .object({
    lessonId: z.string(),
    score: z.number().int().min(0).max(100),
    correctCount: z.number().int().min(0),
    totalQuestions: z.number().int().min(1),
  })
  .strict();

export type QuizScoreResponse = z.infer<typeof QuizScoreSchema>;

export const QuizResponsesResponseSchema = ok(QuizScoreSchema);
