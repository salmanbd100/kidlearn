import type { GradeLevel } from "@kidlearn/db";
import { type Locale, QuizQuestionSchema } from "@kidlearn/types";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";

// The prompt behind the AI Quiz Generator (FR-AI-03).

export const QUIZ_QUESTION_JSON_SCHEMA = JSON.stringify(
  zodToJsonSchema(QuizQuestionSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  }),
  null,
  2,
);

export interface QuizPromptInput {
  lessonTitle: string;
  gradeLevels: readonly GradeLevel[];
  /** Objectives and narration from the lesson's own generation, or its intro scripts. */
  lessonContext: string;
  languages: readonly Locale[];
  count: number;
}

export function buildQuizUserPrompt(input: QuizPromptInput): string {
  const gradeLevels = input.gradeLevels
    .map((grade) => GRADE_LABELS[grade])
    .join(", ");
  const languages = input.languages
    .map((language) => LOCALE_LABELS[language])
    .join(", ");

  return `Generate quiz questions for an existing lesson.

Lesson title: ${input.lessonTitle}
Grade levels: ${gradeLevels}
What the lesson taught:
${input.lessonContext}
Languages: ${languages}
Question count: ${input.count}

Rules:
- Use at least 3 of the 4 formats: mcq, match_pair, drag_answer, picture_select.
- Every question must be answerable purely from what the lesson taught.
- Prompts are spoken aloud: phrase them as a friendly question, per language.
- Every image and audio URL is a placeholder — the artwork and the narration are produced
  separately, and yours are replaced before anything reaches a child. Use
  ${PLACEHOLDER_ASSET_HOST}/<kind>/<locale>/<short-slug>.<ext> and nothing else, never a real
  or invented CDN address. Write the \`alt\` text properly: it is what the illustrator and the
  screen reader both work from.
- Each question must conform exactly to this JSON Schema (also enforced by the tool):

${QUIZ_QUESTION_JSON_SCHEMA}`;
}
