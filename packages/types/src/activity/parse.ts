import {
  lenient,
  migratePayload,
  type PayloadMigrations,
} from "../versioning.js";
import {
  type ActivityDefinition,
  ActivityDefinitionSchema,
} from "./schemas.js";

/** Throws `ZodError`; use where a failure should abort. */
export function parseActivityDefinition(json: unknown): ActivityDefinition {
  return ActivityDefinitionSchema.parse(json);
}

/** Non-throwing, strict write-path check (`standards/backend.md §2`); never use it to read a stored payload. */
export function safeParseActivityDefinition(
  json: unknown,
): ReturnType<typeof ActivityDefinitionSchema.safeParse> {
  return ActivityDefinitionSchema.safeParse(json);
}

/** Steps from each older activity version to the next — none exist yet. */
export const ACTIVITY_MIGRATIONS: PayloadMigrations = {};

const ActivityDefinitionReadSchema = lenient(ActivityDefinitionSchema);

/**
 * Reads a *stored* definition: migrated to `SCHEMA_VERSION`, then parsed with unknown keys
 * dropped so a field from a newer deploy cannot take the step down.
 */
export function readActivityDefinition(
  json: unknown,
): ReturnType<typeof ActivityDefinitionSchema.safeParse> {
  return ActivityDefinitionReadSchema.safeParse(
    migratePayload(json, ACTIVITY_MIGRATIONS),
  );
}
