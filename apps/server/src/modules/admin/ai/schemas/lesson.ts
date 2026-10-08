import { type Locale, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";
import { localized } from "./localized.js";

export const LEARNING_OBJECTIVE_BOUNDS = { min: 2, max: 4 } as const;
export const QUIZ_QUESTION_BOUNDS = { min: 3, max: 5 } as const;

export const LESSON_QUESTION_COUNT = 4;

// Shares the 200-char `LessonTranslation.title` cap with the admin body.
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

// Everything but the questions: one model call; questions are asked one call each (see `generate-questions.ts`).
export function buildLessonBodyOutputSchema(
  languages: readonly Locale[],
): z.ZodType<LessonBodyOutput, z.ZodTypeDef, unknown> {
  return z.object(bodyShape(languages)).strict();
}

// The assembled lesson; `runGenerationJob` validates against it, it is never sent to the model.
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

export interface LessonBodyOutput {
  title: Partial<Record<Locale, string>>;
  learningObjectives: string[];
  introScript: Partial<Record<Locale, string>>;
  narrationScript: Partial<Record<Locale, string>>;
}

export interface LessonGenerationOutput extends LessonBodyOutput {
  quizQuestions: z.infer<typeof QuizQuestionSchema>[];
}
