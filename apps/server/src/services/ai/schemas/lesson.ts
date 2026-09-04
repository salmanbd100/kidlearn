import { type Locale, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";
import { localized } from "./localized.js";

// What the lesson generator's answer must be shaped like (FR-AI-01).

export const LEARNING_OBJECTIVE_BOUNDS = { min: 2, max: 4 } as const;
export const QUIZ_QUESTION_BOUNDS = { min: 3, max: 5 } as const;

/**
 * `LessonTranslation.title` is a varchar the hand-authored admin body caps at
 * 200, and a generated row goes into the same column.
 */
const TITLE_MAX = 200;

export function buildLessonGenerationOutputSchema(
  languages: readonly Locale[],
): z.ZodType<LessonGenerationOutput, z.ZodTypeDef, unknown> {
  return z
    .object({
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
      quizQuestions: z
        .array(QuizQuestionSchema)
        .min(QUIZ_QUESTION_BOUNDS.min)
        .max(QUIZ_QUESTION_BOUNDS.max),
    })
    .strict();
}

/** The parsed shape, widened to every locale as optional. */
export interface LessonGenerationOutput {
  title: Partial<Record<Locale, string>>;
  learningObjectives: string[];
  introScript: Partial<Record<Locale, string>>;
  narrationScript: Partial<Record<Locale, string>>;
  quizQuestions: z.infer<typeof QuizQuestionSchema>[];
}
