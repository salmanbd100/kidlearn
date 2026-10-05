import {
  lenient,
  migratePayload,
  type PayloadMigrations,
} from "../versioning.js";
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
 * with a `400` rather than unwind (see `standards/backend.md §2`). Strict: this
 * is the write path's check — never use it to read a stored payload.
 */
export function safeParseActivityDefinition(
  json: unknown,
): ReturnType<typeof ActivityDefinitionSchema.safeParse> {
  return ActivityDefinitionSchema.safeParse(json);
}

/** Steps from each older activity version to the next — none exist yet. */
export const ACTIVITY_MIGRATIONS: PayloadMigrations = {};

const ActivityDefinitionReadSchema = lenient(ActivityDefinitionSchema);

/**
 * Reads a *stored* activity definition — the lesson API serving one, an engine
 * rendering one. Migrated to `SCHEMA_VERSION` first, then parsed with unknown
 * keys dropped rather than rejected, so a field added by a newer deploy cannot
 * take the step down. `data` is what to serve or render, not the input.
 */
export function readActivityDefinition(
  json: unknown,
): ReturnType<typeof ActivityDefinitionSchema.safeParse> {
  return ActivityDefinitionReadSchema.safeParse(
    migratePayload(json, ACTIVITY_MIGRATIONS),
  );
}
