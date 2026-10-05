/**
 * Reading a stored payload of any age (NFR-SCALE-02). Content outlives code: a
 * JSONB row written today is read by tomorrow's server, by yesterday's web bundle
 * still open on a tablet, and by a server rolled back past the change that wrote
 * it. Write paths stay strict; read paths go through the two helpers here.
 */
import { z } from "zod";
import { SCHEMA_VERSION } from "./primitives.js";

/**
 * Upgrades a payload from the version it is keyed by to the next one. Keyed by
 * the *source* version: `{ 1: v1ToV2 }` turns a v1 payload into a v2 payload.
 */
export type PayloadMigrations = Readonly<
  Record<number, (payload: Record<string, unknown>) => Record<string, unknown>>
>;

/**
 * Walks a payload up to `SCHEMA_VERSION`, one step at a time. Anything it cannot
 * place — not an object, no integer version, a version newer than this code, or
 * a gap in the chain — comes back untouched, so the schema parse that follows
 * rejects it and the caller degrades that one step as it already does.
 */
export function migratePayload(
  json: unknown,
  migrations: PayloadMigrations,
): unknown {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return json;
  }
  // The guard above leaves a non-null, non-array object; TypeScript narrows
  // that only to `object`, which has no index signature to read a key through.
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
 * The same schema with every object stripping unknown keys instead of
 * rejecting them, at every depth. Everything else — required fields, literals,
 * bounds, refinements — is kept, so a lenient parse accepts exactly what the
 * strict one does plus fields this code does not know about, and drops them.
 *
 * Built from Zod 3's internal `_def`, which is not public API: the Zod 4 upgrade
 * (V1-P2-3's ladder) has to rewrite this, and `versioning.test.ts` is what will
 * say so. A construct this does not know throws at module load rather than
 * quietly staying strict.
 */
export function lenient<T extends z.ZodTypeAny>(schema: T): T {
  const cached = cache.get(schema);
  // The output type is unchanged — only the object's unknown-key policy is —
  // so the rebuilt schema stands in for `T`.
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
