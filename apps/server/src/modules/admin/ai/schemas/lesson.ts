import { type Locale, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";
import { localized } from "./localized.js";

// What the lesson generator's answer must be shaped like (FR-AI-01).

export const LEARNING_OBJECTIVE_BOUNDS = { min: 2, max: 4 } as const;
export const QUIZ_QUESTION_BOUNDS = { min: 3, max: 5 } as const;

/**
 * How many questions a generated lesson carries. One per format, which is both
 * inside the bounds above and the mix `planQuestionFormats` exists to produce.
 */
export const LESSON_QUESTION_COUNT = 4;

/**
 * `LessonTranslation.title` is a varchar the hand-authored admin body caps at
 * 200, and a generated row goes into the same column.
 */
const TITLE_MAX = 200;

function bodyShape(languages: readonly Locale[]) {
  return {
    title: localized(
      languages,
      "The child-facing lesson name, two to five words, written for the language it is in rather than translated from English.",
      TITLE_MAX,
    ),
    learningObjectives: z
      .array(z.string().min(1))
      .min(LEARNING_OBJECTIVE_BOUNDS.min)
      .max(LEARNING_OBJECTIVE_BOUNDS.max)
      .describe(
        "Short internal objectives in English. Never shown to a child.",
      ),
    introScript: localized(
      languages,
      "Two to three spoken sentences in which the mascot greets the child and says what they will learn.",
    ),
    narrationScript: localized(
      languages,
      "Sixty to a hundred and twenty spoken words teaching the concept. This is the source text for the lesson video's narration.",
    ),
  };
}

/**
 * Everything but the questions — one model call's worth. The questions are asked
 * for separately, one call each: see `generate-questions.ts` for why the four
 * formats cannot be offered in a single response schema.
 */
export function buildLessonBodyOutputSchema(
  languages: readonly Locale[],
): z.ZodType<LessonBodyOutput, z.ZodTypeDef, unknown> {
  return z.object(bodyShape(languages)).strict();
}

/**
 * The whole lesson, body and questions assembled. Never sent to the model as a
 * response schema — it is what `runGenerationJob` validates the assembled answer
 * against before anything is written.
 */
export function buildLessonGenerationOutputSchema(
  languages: readonly Locale[],
): z.ZodType<LessonGenerationOutput, z.ZodTypeDef, unknown> {
  return z
    .object({
      ...bodyShape(languages),
      quizQuestions: z
        .array(QuizQuestionSchema)
        .min(QUIZ_QUESTION_BOUNDS.min)
        .max(QUIZ_QUESTION_BOUNDS.max),
    })
    .strict();
}

/** The parsed shape, widened to every locale as optional. */
export interface LessonBodyOutput {
  title: Partial<Record<Locale, string>>;
  learningObjectives: string[];
  introScript: Partial<Record<Locale, string>>;
  narrationScript: Partial<Record<Locale, string>>;
}

export interface LessonGenerationOutput extends LessonBodyOutput {
  quizQuestions: z.infer<typeof QuizQuestionSchema>[];
}
