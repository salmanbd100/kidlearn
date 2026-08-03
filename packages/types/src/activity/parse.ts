import {
  type ActivityDefinition,
  ActivityDefinitionSchema,
} from "./schemas.js";

/**
 * Parses an activity definition read from JSONB or submitted by an author.
 * Throws `ZodError` on invalid input — use this where a failure should abort.
 */
export function parseActivityDefinition(json: unknown): ActivityDefinition {
  return ActivityDefinitionSchema.parse(json);
}

/**
 * Non-throwing variant for validators that need to collect issues and respond
 * with a `400` rather than unwind (see `standards/backend.md §2`).
 */
export function safeParseActivityDefinition(
  json: unknown,
): ReturnType<typeof ActivityDefinitionSchema.safeParse> {
  return ActivityDefinitionSchema.safeParse(json);
}
