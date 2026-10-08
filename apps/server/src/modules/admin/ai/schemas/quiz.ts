import { QUIZ_QUESTION_TYPES, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";

export const QUIZ_COUNT_BOUNDS = { min: 3, max: 5 } as const;

// Three rather than four formats: the floor on `count` is three, so requiring all four would forbid the smallest quiz.
export const MIN_DISTINCT_FORMATS = 3;

export function buildQuizGenerationOutputSchema(
  count: number,
): z.ZodType<QuizGenerationOutput, z.ZodTypeDef, unknown> {
  return z
    .object({
      questions: z
        .array(QuizQuestionSchema)
        .length(count)
        .describe(
          `Exactly ${count} questions, each answerable from what the lesson taught.`,
        ),
    })
    .strict()
    .superRefine((value, ctx) => {
      const formats = new Set(value.questions.map((one) => one.type));
      if (formats.size >= MIN_DISTINCT_FORMATS) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions"],
        message: `use at least ${MIN_DISTINCT_FORMATS} of the ${QUIZ_QUESTION_TYPES.length} question formats (${QUIZ_QUESTION_TYPES.join(", ")}) — this set uses ${[...formats].join(", ")}`,
      });
    });
}

export interface QuizGenerationOutput {
  questions: z.infer<typeof QuizQuestionSchema>[];
}
