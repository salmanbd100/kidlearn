import type { GradeLevel } from "@kidlearn/db";
import {
  type Locale,
  QUIZ_QUESTION_SCHEMAS,
  type QuizQuestionType,
} from "@kidlearn/types";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";

// The prompt behind the AI Quiz Generator (FR-AI-03).

/**
 * One JSON Schema per format rather than the whole union: a question is asked for
 * one format at a time, and the union is far more than `responseJsonSchema`
 * accepts (see `generate-questions.ts`). Quoting only the format being asked for
 * also keeps the prompt a quarter of the size it would otherwise be.
 */
export const QUIZ_QUESTION_JSON_SCHEMAS = Object.fromEntries(
  Object.entries(QUIZ_QUESTION_SCHEMAS).map(([type, schema]) => [
    type,
    JSON.stringify(
      zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }),
      null,
      2,
    ),
  ]),
) as Record<QuizQuestionType, string>;

export interface QuizPromptInput {
  lessonTitle: string;
  gradeLevels: readonly GradeLevel[];
  /** Objectives and narration from the lesson's own generation, or its intro scripts. */
  lessonContext: string;
  languages: readonly Locale[];
  format: QuizQuestionType;
  /** 1-based, and named to the model so each question differs from the last. */
  position: number;
  total: number;
}

export function buildQuizUserPrompt(input: QuizPromptInput): string {
  const gradeLevels = input.gradeLevels
    .map((grade) => GRADE_LABELS[grade])
    .join(", ");
  const languages = input.languages
    .map((language) => LOCALE_LABELS[language])
    .join(", ");

  return `Write question ${input.position} of ${input.total} for an existing lesson's quiz.

Lesson title: ${input.lessonTitle}
Grade levels: ${gradeLevels}
What the lesson taught:
${input.lessonContext}
Languages: ${languages}
Format: ${input.format}

Rules:
- Answerable purely from what the lesson taught.
- The prompt is spoken aloud: phrase it as a friendly question, per language.
- Ask something the quiz's other questions would not. This is question
  ${input.position} of ${input.total}, and they are written one at a time.
- Every image and audio URL is a placeholder — the artwork and the narration are produced
  separately, and yours are replaced before anything reaches a child. Use
  ${PLACEHOLDER_ASSET_HOST}/<kind>/<locale>/<short-slug>.<ext> and nothing else, never a real
  or invented CDN address. Write the \`alt\` text properly: it is what the illustrator and the
  screen reader both work from.
- The question must conform exactly to this JSON Schema (also enforced by the tool):

${QUIZ_QUESTION_JSON_SCHEMAS[input.format]}`;
}
