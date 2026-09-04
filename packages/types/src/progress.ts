import { z } from "zod";

/**
 * The lesson-flow vocabulary, shared by the player and the server (FR-LSN-01..07).
 */
export const LESSON_STEPS = [
  "intro",
  "video",
  "activity",
  "quiz",
  "reward",
] as const;
export const LessonStepSchema = z.enum(LESSON_STEPS);
export type LessonStep = (typeof LESSON_STEPS)[number];

/** The step after `step`, or `null` at the end of the flow. */
export function nextLessonStep(step: LessonStep): LessonStep | null {
  return LESSON_STEPS[LESSON_STEPS.indexOf(step) + 1] ?? null;
}

/** Where a lesson opens, given the last step the child **finished**. */
export function resumeLessonStep(lastCompleted: LessonStep | null): LessonStep {
  if (lastCompleted === null) return LESSON_STEPS[0];
  return nextLessonStep(lastCompleted) ?? LESSON_STEPS[0];
}

/** `POST /api/progress/lessons/:id/step` — one finished step. */
export const LessonStepReportSchema = z
  .object({
    step: LessonStepSchema,
    completed: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.completed && value.step !== "reward") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completed"],
        message: 'completed may only be true when step is "reward"',
      });
    }
  });

export type LessonStepReport = z.infer<typeof LessonStepReportSchema>;

/** The `SessionEvent` types the lesson player emits (FR-LSN-07, FR-TIME-06). */
export const LESSON_SESSION_EVENT_TYPES = [
  "lesson_start",
  "step_complete",
  "lesson_complete",
] as const;
export const LessonSessionEventTypeSchema = z.enum(LESSON_SESSION_EVENT_TYPES);
export type LessonSessionEventType = z.infer<
  typeof LessonSessionEventTypeSchema
>;

/** `POST /api/progress/events` — one lesson-flow event. */
export const SessionEventReportSchema = z
  .object({
    type: LessonSessionEventTypeSchema,
    lessonId: z.string().uuid(),
    /** Present on `step_complete`, absent on the two lesson-level events. */
    step: LessonStepSchema.optional(),
    /**
     * `true` when the step the child just finished played an English asset
     * because their locale had none (`LessonAssetFallbacks`, FR-I18N-01).
     */
    fallback: z.boolean().optional(),
    clientTs: z.string().datetime(),
  })
  .strict();

export type SessionEventReport = z.infer<typeof SessionEventReportSchema>;

/**
 * One answer, in the shape the format that produced it gives it (FR-QUIZ-08).
 */
export const QuizAnswerValueSchema = z.union([
  z.string().min(1),
  z
    .object({
      pairs: z
        .array(
          z
            .object({ leftId: z.string().min(1), rightId: z.string().min(1) })
            .strict(),
        )
        .min(1),
    })
    .strict(),
]);

export type QuizAnswerValue = z.infer<typeof QuizAnswerValueSchema>;

/** One question, as the child answered it. */
export const QuizResponseRecordSchema = z
  .object({
    questionId: z.string().min(1),
    answer: QuizAnswerValueSchema,
    isCorrect: z.boolean(),
    attempts: z.number().int().min(1).max(50),
  })
  .strict();

export type QuizResponseRecord = z.infer<typeof QuizResponseRecordSchema>;

/** `POST /api/progress/quizzes/:quizId/responses` — the whole quiz, once. */
export const QuizResponsesSubmitSchema = z
  .object({
    responses: z.array(QuizResponseRecordSchema).min(1).max(10),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.responses.forEach((response, index) => {
      if (seen.has(response.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["responses", index, "questionId"],
          message: `duplicate questionId "${response.questionId}"`,
        });
      }
      seen.add(response.questionId);
    });
  });

export type QuizResponsesSubmit = z.infer<typeof QuizResponsesSubmitSchema>;
