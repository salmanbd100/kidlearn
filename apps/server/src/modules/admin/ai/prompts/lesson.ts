import type { GradeLevel } from "@kidlearn/db";
import type { Locale, QuizQuestionType } from "@kidlearn/types";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";

// The prompts behind the AI Lesson Generator (FR-AI-01).

export const KIDLEARN_SYSTEM_PROMPT = `You are a curriculum writer for KidLearn, an educational platform for children aged 3 to 6
(grades: Nursery, KG-1, KG-2). You write warm, simple, encouraging content designed to be
READ ALOUD to a child who cannot yet read.

Hard rules:
- Age-appropriate: short sentences, concrete everyday words, playful and gentle tone.
- Culturally neutral: no religious references, no country-specific idioms, no brand names,
  no holidays tied to one culture.
- Safe: absolutely no violence, fear, scary imagery, danger, injury, or negative pressure.
  Mistakes are always okay and met with encouragement.
- Multilingual: every child-facing string must be provided in EVERY requested language with
  natural, native-quality phrasing — never a literal word-for-word translation.
- Output ONLY by calling the provided tool with JSON conforming exactly to its schema.`;

export interface LessonPromptInput {
  gradeLevel: GradeLevel;
  subjectName: string;
  topicName: string;
  lessonFocus: string;
  languages: readonly Locale[];
}

export function buildLessonUserPrompt(input: LessonPromptInput): string {
  const languages = input.languages
    .map((language) => LOCALE_LABELS[language])
    .join(", ");

  return `Generate a lesson plan.

Grade level: ${GRADE_LABELS[input.gradeLevel]}
Subject: ${input.subjectName}
Topic: ${input.topicName}
Lesson focus: ${input.lessonFocus}
Languages: ${languages}

Produce:
1. title — the lesson name a child sees on its card, 2 to 5 words, per language. Write each
   one for the language it is in; do not translate the English one word for word.
2. learningObjectives — 2 to 4 short objectives (English only; internal, not child-facing).
3. introScript — 2 to 3 spoken sentences where a friendly mascot greets the child and says
   what they will learn today, per language. (FR-LSN-01)
4. narrationScript — 60 to 120 spoken words teaching the concept with simple examples a
   3–6 year old sees in daily life, per language. (source text for video narration)

The quiz is asked for separately, one question at a time.`;
}

export interface LessonQuestionPromptInput extends LessonPromptInput {
  format: QuizQuestionType;
  /** 1-based, and named to the model so each question differs from the last. */
  position: number;
  total: number;
}

/** One question of a generated lesson's quiz (FR-AI-01). */
export function buildLessonQuestionUserPrompt(
  input: LessonQuestionPromptInput,
): string {
  const languages = input.languages
    .map((language) => LOCALE_LABELS[language])
    .join(", ");

  return `Write question ${input.position} of ${input.total} for this lesson's quiz.

Grade level: ${GRADE_LABELS[input.gradeLevel]}
Subject: ${input.subjectName}
Topic: ${input.topicName}
Lesson focus: ${input.lessonFocus}
Languages: ${languages}
Format: ${input.format}

Rules:
- Answerable from what this lesson teaches, and matched to the grade level.
- The prompt is spoken aloud: phrase it as a friendly question, in every language.
- Ask something the lesson's other questions would not. This is question
  ${input.position} of ${input.total}, and they are written one at a time.
${PLACEHOLDER_RULE}`;
}

const PLACEHOLDER_RULE = `- Every audio and image URL is a placeholder: the narration and the artwork are produced
  separately, and yours are replaced before anything reaches a child. Use
  ${PLACEHOLDER_ASSET_HOST}/<kind>/<locale>/<short-slug>.<ext> and nothing else — never a real
  or invented CDN address. Write the \`alt\` text properly, because that is what the
  illustrator and the screen reader both work from.`;
