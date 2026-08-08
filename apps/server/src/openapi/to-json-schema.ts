import { type ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * The one place Zod becomes JSON Schema.
 *
 * `target: "openApi3"` is load-bearing. This API is full of nullable fields —
 * `avatarCharacterId`, `mascot`, `introScript`, `progress`, every `*Url` — and
 * OpenAPI 3.0 spells those `{ type: "string", nullable: true }` rather than JSON
 * Schema's `type: ["string", "null"]`. Swagger UI renders the former correctly and
 * the latter as an empty type.
 *
 * The conversion runs in `apps/server` rather than in `@kidlearn/types`
 * deliberately: the schemas themselves stay pure Zod, with no OpenAPI library in
 * their dependency tree that `apps/web` would then inherit for no reason.
 *
 * Two limits are worth knowing, because the converter drops them **silently**:
 *
 *  - `.refine()` / `.superRefine()` have no JSON Schema equivalent. So
 *    `UpdateChildBodySchema`'s "at least one field required" rule, and the
 *    cross-field rules in `@kidlearn/types`' `refinements.ts`, vanish. Anything
 *    that matters to a caller has to be restated in a `description` — see
 *    `paths/children.ts`.
 *  - `z.record(z.string())` becomes `additionalProperties: { type: "string" }`
 *    with no declared properties, which is accurate but tells a reader nothing.
 *    Hence the worked example in `PaletteSchema`'s description.
 *
 * And one it gets outright wrong — see `normalizeNullLiterals` below.
 */

/** A JSON Schema object, as far as this module cares. */
export type JsonSchemaObject = Record<string, unknown>;

/**
 * Repairs `z.null()`.
 *
 * The `openApi3` target emits `{ enum: ["null"], nullable: true }` for a
 * `ZodNull` — note the quotes. That describes a field whose only legal value is
 * the four-character string `"null"`, which is not what the schema says and not
 * what the server sends. kidlearn hits this on every reserved placeholder field
 * (`LessonListItem.progress`, `LessonDetail.progress`), so a client generated
 * from the unrepaired spec would type them as `"null"` string literals.
 *
 * Fixed here rather than by avoiding `z.null()` upstream, because `z.null()` is
 * the correct runtime contract and the route tests rely on it to assert that the
 * placeholders really are null.
 */
function normalizeNullLiterals(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) normalizeNullLiterals(item);
    return;
  }
  if (node === null || typeof node !== "object") return;

  const schema = node as JsonSchemaObject;
  const { enum: enumValues, nullable, type } = schema;
  if (
    nullable === true &&
    type === undefined &&
    Array.isArray(enumValues) &&
    enumValues.length === 1 &&
    enumValues[0] === "null"
  ) {
    schema.enum = [null];
  }

  for (const value of Object.values(schema)) normalizeNullLiterals(value);
}

/**
 * Converts a map of named schemas into `components.schemas` entries, with every
 * internal `$ref` pointing at `#/components/schemas/<Name>`.
 *
 * One call for the whole map, not one per schema: that is what lets a schema
 * referenced from several places (`MediaSummary`, `WorldSummary`) be emitted once
 * and referenced, instead of inlined at each use site.
 */
export function buildComponentSchemas(
  definitions: Record<string, ZodTypeAny>,
): Record<string, JsonSchemaObject> {
  // The first argument is the schema being converted; we only want the
  // definitions block, so an empty object is the cheapest possible carrier.
  const converted = zodToJsonSchema(z.object({}), {
    target: "openApi3",
    definitions,
    definitionPath: "schemas",
    basePath: ["#", "components"],
    // `"none"`, not the default `"root"`. With `"root"`, any schema *object*
    // reused across two places — `PinSchema` for `pin` and `currentPin`,
    // `LocaleSchema`, the `AssetRef`s inside the activity unions — is emitted once
    // and referenced the second time by a JSON pointer *into* another schema's
    // subtree, e.g. `#/components/schemas/CreateChildBody/properties/firstName`.
    // That is a legal JSON Pointer and an illegal OpenAPI `$ref`: 3.0 allows a
    // reference only to a component, and Swagger UI resolves nothing else — the
    // affected models render empty, with no error to explain why.
    //
    // `"none"` inlines those instead. The named entries in `definitions` still
    // become proper `#/components/schemas/<Name>` references, because they are
    // matched by identity before this strategy applies; the cost is that
    // *unnamed* reuse is duplicated in the output, which is a bigger file and a
    // correct one. `document.test.ts` asserts no `$ref` escapes `components.schemas`.
    $refStrategy: "none",
  }) as { schemas?: Record<string, JsonSchemaObject> };

  const schemas = converted.schemas;
  if (!schemas) {
    // Unreachable unless zod-to-json-schema changes where it puts the
    // definitions block. Fail loudly at boot rather than serving a spec whose
    // every `$ref` dangles.
    throw new Error(
      "zod-to-json-schema returned no definitions block — the `definitionPath` contract changed",
    );
  }
  normalizeNullLiterals(schemas);
  return schemas;
}

/** A `$ref` at a schema registered in `components.schemas`. */
export function schemaRef(name: string): JsonSchemaObject {
  return { $ref: `#/components/schemas/${name}` };
}
