import { type ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// The one place Zod becomes JSON Schema.

/** A JSON Schema object, as far as this module cares. */
export type JsonSchemaObject = Record<string, unknown>;

/** Repairs `z.null()`. */
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
    // reference only to a component, and a reader resolves nothing else — the
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
