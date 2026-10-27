import { GRADE_LEVELS, LOCALES, QUIZ_QUESTION_TYPES } from "@kidlearn/types";
import { PLACEHOLDER_ASSET_HOST } from "../placeholder-assets.js";
import {
  LEARNING_OBJECTIVE_BOUNDS,
  QUIZ_QUESTION_BOUNDS,
} from "../schemas/lesson.js";
import { QUIZ_COUNT_BOUNDS } from "../schemas/quiz.js";
import { CHARACTER_BOUNDS, STORY_PAGE_BOUNDS } from "../schemas/story.js";
import { GRADE_LABELS, LOCALE_LABELS } from "./labels.js";
import { KIDLEARN_SYSTEM_PROMPT } from "./lesson.js";

/**
 * What an external assistant is told over MCP (FR-AI-10). Kept beside the Gemini prompts and built from the
 * same constants, so a rule changed for one path is changed for both.
 */

const REVIEW_NOTE =
  "Everything you submit becomes a draft in KidLearn's AI Queue. A person reads it and decides; nothing you submit is ever shown to a child until they approve it.";

const PLACEHOLDER_RULE = `Every audio and image URL you write is a placeholder: narration and artwork are produced separately and yours are replaced before anything reaches a child. Use ${PLACEHOLDER_ASSET_HOST}/<kind>/<locale>/<short-slug>.<ext> and nothing else — never a real or invented CDN address. Write \`alt\` text properly: it is what the illustrator and the screen reader both work from.`;

// The Gemini system prompt ends by telling the model to answer through "the provided tool"; over MCP that tool is a submit_* call.
const HARD_RULES = KIDLEARN_SYSTEM_PROMPT.replace(
  "Output ONLY by calling the provided tool with JSON conforming exactly to its schema.",
  "Submit content ONLY through the submit_* tools, as JSON conforming exactly to their schemas.",
);

export const MCP_SERVER_INSTRUCTIONS = `KidLearn is an educational platform for children aged 3 to 6. These tools let you write draft lessons, stories and quiz questions for it. Call get_authoring_guide before writing anything. ${REVIEW_NOTE}`;

export function buildAuthoringGuide(): string {
  const grades = GRADE_LEVELS.map(
    (grade) => `- ${grade}: ${GRADE_LABELS[grade]}`,
  ).join("\n");
  const locales = LOCALES.map(
    (locale) => `- ${locale}: ${LOCALE_LABELS[locale]}`,
  ).join("\n");

  return `# Writing content for KidLearn

${REVIEW_NOTE}

## Who you are writing for

${HARD_RULES}

## Grade levels
${grades}

## Languages
${locales}
Write every child-facing string in every language the submission names. Bangla must read as if a native speaker wrote it, not as a translation of the English.

## Assets
${PLACEHOLDER_RULE}

## How to work
1. list_curriculum — find the subject, topic and world ids. Never invent an id.
2. For a quiz, get_lesson first: questions must be answerable from what the lesson taught.
3. For a story, list_characters for the world, and reuse an existing character's description when one fits.
4. Write the content, then call submit_lesson_draft, submit_story_draft or submit_quiz_questions.
5. If the tool answers with validation errors, fix exactly those fields and submit again. Keep everything that was already valid.
6. Pass a clientRequestId you choose for each piece of content. Re-sending the same one returns the first draft rather than creating a second, so a retry after a timeout is safe.
7. get_draft_status tells you where a draft is. A rejected draft carries the reviewer's reason — read it before writing the next attempt.

## Shapes
- Lesson: title, learningObjectives (${LEARNING_OBJECTIVE_BOUNDS.min}–${LEARNING_OBJECTIVE_BOUNDS.max}, English, internal), introScript (2–3 spoken sentences), narrationScript (60–120 spoken words), quizQuestions (${QUIZ_QUESTION_BOUNDS.min}–${QUIZ_QUESTION_BOUNDS.max}).
- Story: title, moral, characterDescriptions (${CHARACTER_BOUNDS.min}–${CHARACTER_BOUNDS.max}), pages (${STORY_PAGE_BOUNDS.min}–${STORY_PAGE_BOUNDS.max}, numbered from 1). Every illustrationPrompt names at least one declared character.
- Quiz: ${QUIZ_COUNT_BOUNDS.min}–${QUIZ_COUNT_BOUNDS.max} questions using at least three of the formats ${QUIZ_QUESTION_TYPES.join(", ")}.
- Each quiz question's exact JSON Schema, with a valid example, comes from get_quiz_format_schema. Fetch the ones you use.`;
}

const SUBMIT_FOOTER = `Call get_authoring_guide first. ${PLACEHOLDER_RULE} ${REVIEW_NOTE} If the answer is an error listing fields, correct those fields and submit again.`;

export const SUBMIT_LESSON_DESCRIPTION = `Submit a complete lesson — its child-facing title, objectives, spoken intro and narration, and ${QUIZ_QUESTION_BOUNDS.min}–${QUIZ_QUESTION_BOUNDS.max} quiz questions — as a draft for human review. Every localised field needs every language in \`languages\`. ${SUBMIT_FOOTER}`;

export const SUBMIT_STORY_DESCRIPTION = `Submit an illustrated story of ${STORY_PAGE_BOUNDS.min}–${STORY_PAGE_BOUNDS.max} pages set in one world, as a draft for human review. Pages are numbered 1..n with no gaps; each page's illustrationPrompt is English and names a declared character. ${SUBMIT_FOOTER}`;

export const SUBMIT_QUIZ_DESCRIPTION = `Submit ${QUIZ_COUNT_BOUNDS.min}–${QUIZ_COUNT_BOUNDS.max} quiz questions for an existing lesson, as drafts for human review. Use at least three of the formats ${QUIZ_QUESTION_TYPES.join(", ")}; get_quiz_format_schema has each one's exact shape. Refused while the lesson's quiz is published. ${SUBMIT_FOOTER}`;
