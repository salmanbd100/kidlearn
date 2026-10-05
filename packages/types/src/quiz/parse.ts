import {
  lenient,
  migratePayload,
  type PayloadMigrations,
} from "../versioning.js";
import { type QuizQuestionDefinition, QuizQuestionSchema } from "./schemas.js";

/** Throws `ZodError`; use where a failure should abort. */
export function parseQuizQuestion(json: unknown): QuizQuestionDefinition {
  return QuizQuestionSchema.parse(json);
}

/** Non-throwing, strict write-path check (`standards/backend.md §2`); never use it to read a stored payload. */
export function safeParseQuizQuestion(
  json: unknown,
): ReturnType<typeof QuizQuestionSchema.safeParse> {
  return QuizQuestionSchema.safeParse(json);
}

/** Steps from each older quiz question version to the next — none exist yet. */
export const QUIZ_QUESTION_MIGRATIONS: PayloadMigrations = {};

const QuizQuestionReadSchema = lenient(QuizQuestionSchema);

/** Reads a *stored* quiz question (serving, grading, rendering). Same contract as `readActivityDefinition`. */
export function readQuizQuestion(
  json: unknown,
): ReturnType<typeof QuizQuestionSchema.safeParse> {
  return QuizQuestionReadSchema.safeParse(
    migratePayload(json, QUIZ_QUESTION_MIGRATIONS),
  );
}
