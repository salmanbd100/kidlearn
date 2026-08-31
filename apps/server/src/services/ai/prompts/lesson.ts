import type { GradeLevel } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";

/**
 * The prompts behind the AI Lesson Generator (FR-AI-01).
 *
 * `KIDLEARN_SYSTEM_PROMPT` is the shared persona — file 35's story and quiz
 * generators reuse it unchanged, so a safety rule tightened here tightens
 * everywhere. It carries the content rules the spec makes non-negotiable
 * (NFR-SAFE, FR-I18N-01): age-appropriate, culturally neutral, never frightening,
 * native-quality in every requested language.
 *
 * Neither prompt restates the JSON shape. The tool's `input_schema` is generated
 * from the very Zod object the answer is validated against, so describing the
 * fields in prose would be a second source of truth that drifts the first time a
 * question format gains one (FR-AI-03, `services/ai/claude.ts`).
 */

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

  return `Generate a complete lesson plan.

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
5. quizQuestions — 3 to 5 questions matched to the grade level, using a mix of the four
   formats (mcq, match_pair, drag_answer, picture_select), each conforming to the question
   schema, with prompts in every requested language.

Every audio and image URL in the quiz questions is a placeholder: the narration and the
artwork are produced separately, and yours are replaced before anything reaches a child.
Use ${PLACEHOLDER_ASSET_HOST}/<kind>/<locale>/<short-slug>.<ext> and nothing else — never a
real or invented CDN address. Write the \`alt\` text properly, because that is what the
illustrator and the screen reader both work from.`;
}
