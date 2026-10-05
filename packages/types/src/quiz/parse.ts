import {
  lenient,
  migratePayload,
  type PayloadMigrations,
} from "../versioning.js";
import { type QuizQuestionDefinition, QuizQuestionSchema } from "./schemas.js";

/**
 * Parses a quiz question definition read from JSONB or submitted by an author.
 * Throws `ZodError` on invalid input — use this where a failure should abort.
 */
export function parseQuizQuestion(json: unknown): QuizQuestionDefinition {
  return QuizQuestionSchema.parse(json);
}

/**
 * Non-throwing variant for validators that need to collect issues and respond
 * with a `400` rather than unwind (see `standards/backend.md §2`). Strict: this
 * is the write path's check — never use it to read a stored payload.
 */
export function safeParseQuizQuestion(
  json: unknown,
): ReturnType<typeof QuizQuestionSchema.safeParse> {
  return QuizQuestionSchema.safeParse(json);
}

/** Steps from each older quiz question version to the next — none exist yet. */
export const QUIZ_QUESTION_MIGRATIONS: PayloadMigrations = {};

const QuizQuestionReadSchema = lenient(QuizQuestionSchema);

/**
 * Reads a *stored* quiz question — the lesson API serving it, the server grading
 * an answer against it, the engine rendering it. Same contract as
 * `readActivityDefinition`.
 */
export function readQuizQuestion(
  json: unknown,
): ReturnType<typeof QuizQuestionSchema.safeParse> {
  return QuizQuestionReadSchema.safeParse(
    migratePayload(json, QUIZ_QUESTION_MIGRATIONS),
  );
}
