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
 * with a `400` rather than unwind (see `standards/backend.md §2`).
 */
export function safeParseQuizQuestion(
  json: unknown,
): ReturnType<typeof QuizQuestionSchema.safeParse> {
  return QuizQuestionSchema.safeParse(json);
}
