/**
 * Reading a stored payload of any age (NFR-SCALE-02). A JSONB row is read by newer servers, older
 * web bundles and rolled-back servers alike: writes stay strict, reads go through the helpers here.
 */
import { z } from "zod";
import { SCHEMA_VERSION } from "./primitives.js";

/** Upgrades a payload one version, keyed by the *source* version: `{ 1: v1ToV2 }`. */
export type PayloadMigrations = Readonly<
  Record<number, (payload: Record<string, unknown>) => Record<string, unknown>>
>;

/**
 * Walks a payload up to `SCHEMA_VERSION`. Anything it cannot place (not an object, no integer
 * version, newer than this code, gap in the chain) comes back untouched for the parse to reject.
 */
export function migratePayload(
  json: unknown,
  migrations: PayloadMigrations,
): unknown {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return json;
  }
  // The guard leaves a non-null, non-array object, which TypeScript narrows only to `object`.
  let payload = json as Record<string, unknown>;
  const stored = payload.schemaVersion;
  if (typeof stored !== "number" || !Number.isInteger(stored)) return json;
  let version = stored;

  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) return json;
    payload = step(payload);
    const next: unknown = payload.schemaVersion;
    // A migration that does not advance the version would loop forever.
    if (typeof next !== "number" || next <= version) return json;
    version = next;
  }
  return payload;
}

const cache = new WeakMap<z.ZodTypeAny, z.ZodTypeAny>();

/**
 * The same schema with every object stripping unknown keys instead of rejecting them, at every
 * depth; all other constraints are kept. Built from Zod 3's non-public `_def`, so the Zod 4
 * upgrade must rewrite it (`versioning.test.ts` will say so). An unknown construct throws at load.
 */
export function lenient<T extends z.ZodTypeAny>(schema: T): T {
  const cached = cache.get(schema);
  // Only the unknown-key policy changes, so the rebuilt schema stands in for `T`.
  if (cached) return cached as T;
  const rebuilt = rebuild(schema);
  cache.set(schema, rebuilt);
  return rebuilt as T;
}

function rebuild(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const shape: z.ZodRawShape = {};
    for (const [key, value] of Object.entries(schema.shape as z.ZodRawShape)) {
      shape[key] = lenient(value);
    }
    return new z.ZodObject({
      ...schema._def,
      shape: () => shape,
      unknownKeys: "strip",
    });
  }
  if (schema instanceof z.ZodEffects) {
    return new z.ZodEffects({
      ...schema._def,
      schema: lenient(schema._def.schema),
    });
  }
  if (schema instanceof z.ZodArray) {
    return new z.ZodArray({ ...schema._def, type: lenient(schema._def.type) });
  }
  if (schema instanceof z.ZodOptional) {
    return new z.ZodOptional({
      ...schema._def,
      innerType: lenient(schema._def.innerType),
    });
  }
  if (schema instanceof z.ZodNullable) {
    return new z.ZodNullable({
      ...schema._def,
      innerType: lenient(schema._def.innerType),
    });
  }
  if (schema instanceof z.ZodUnion) {
    return new z.ZodUnion({
      ...schema._def,
      options: schema._def.options.map((option: z.ZodTypeAny) =>
        lenient(option),
      ),
    });
  }
  if (
    schema instanceof z.ZodString ||
    schema instanceof z.ZodNumber ||
    schema instanceof z.ZodBoolean ||
    schema instanceof z.ZodLiteral ||
    schema instanceof z.ZodEnum
  ) {
    return schema;
  }
  throw new Error(
    `lenient(): unsupported schema type ${schema._def.typeName ?? "unknown"}`,
  );
}
