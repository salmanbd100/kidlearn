import { type Locale, QuizQuestionSchema } from "@kidlearn/types";
import { z } from "zod";

/**
 * What the lesson generator's tool call must return (FR-AI-01).
 *
 * **Built per request, not once.** An admin picks which languages a lesson is
 * generated in, and the schema is what makes that binding: asking for `["en"]`
 * produces a schema where `introScript` has exactly an `en` key, and a response
 * carrying `bn` as well is rejected as strictly as one missing `en`. A fixed
 * two-locale schema could only ever express "both", which would either force a
 * Bangla script nobody asked for or make the requested set advisory.
 *
 * **The title is generated per locale, not derived from the admin's focus line.**
 * `LessonTranslation.title` is what a child reads on a lesson card, so an English
 * focus line copied into the Bangla row would be untranslated child-facing text
 * that no reviewer sees as missing, because the field is filled (FR-I18N-01). The
 * focus line still names the row for the CMS and supplies the slug.
 *
 * **`quizQuestions` is `QuizQuestionSchema` from `@kidlearn/types`, unchanged.**
 * The same union the renderer draws from, the admin editor validates against and
 * the student API serves — so the tool's `input_schema` and the acceptance test
 * are one object (FR-AI-03). Note that it requires *both* locales on every
 * question regardless of `languages`, because a stored question is content and
 * the payload contract has always required both (FR-I18N-01); the per-locale
 * choice above governs the scripts, which are this lesson's own text.
 *
 * The bounds come straight from the spec: 2–4 objectives, 3–5 questions.
 */

export const LEARNING_OBJECTIVE_BOUNDS = { min: 2, max: 4 } as const;
export const QUIZ_QUESTION_BOUNDS = { min: 3, max: 5 } as const;

/**
 * `LessonTranslation.title` is a varchar the hand-authored admin body caps at
 * 200, and a generated row goes into the same column.
 */
const TITLE_MAX = 200;

/** An object with exactly the requested locales as required string keys. */
function localized(
  languages: readonly Locale[],
  description: string,
  max?: number,
) {
  const value =
    max === undefined ? z.string().min(1) : z.string().min(1).max(max);
  const shape = Object.fromEntries(
    languages.map((language) => [language, value]),
  );
  return z.object(shape).strict().describe(description);
}

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

/**
 * The parsed shape, widened to every locale as optional.
 *
 * The runtime schema is exact about which locales are present; the static type
 * cannot be, because the set is a request parameter. Consumers read it through
 * the same `languages` array they asked with, so the optionality is checked where
 * it is actually decided rather than assumed away.
 */
export interface LessonGenerationOutput {
  title: Partial<Record<Locale, string>>;
  learningObjectives: string[];
  introScript: Partial<Record<Locale, string>>;
  narrationScript: Partial<Record<Locale, string>>;
  quizQuestions: z.infer<typeof QuizQuestionSchema>[];
}
