import { QUIZ_QUESTION_TYPES, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";

/**
 * What the quiz generator's tool call must return (FR-AI-03).
 *
 * **Deliberately thin.** The questions are `QuizQuestionSchema` from
 * `@kidlearn/types`, untouched — the same union the renderer draws from, the admin
 * editor validates against and the student API serves. This file adds a count and
 * a format spread and nothing else; a field described here that the payload
 * contract does not have would be a second source of truth, and the tool's
 * `input_schema` is generated from this object, so the prompt's contract and the
 * validator that accepts the answer cannot drift apart.
 *
 * **Exactly `count` questions, not a range.** Unlike the lesson generator — where
 * nobody names a number and 3–5 is the spec's bound — here the admin asked for a
 * count, and a quiz that came back with three when four were requested would
 * quietly change the lesson an admin thought they were reviewing.
 *
 * **At least three of the four formats.** A quiz of four multiple-choice questions
 * is the shape a model reaches for by default and the least useful one for a
 * pre-reader: matching, dragging and picture-picking are different skills, and one
 * retry showing the model its own issue is cheaper than a reviewer rewriting a
 * question by hand (FR-QUIZ-01..04).
 */

export const QUIZ_COUNT_BOUNDS = { min: 3, max: 5 } as const;

/**
 * How many of the four formats a generated quiz must use. Three rather than four
 * because the floor on `count` is three: requiring all four would make the
 * smallest permitted quiz impossible.
 */
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
