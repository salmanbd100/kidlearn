import { type ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type JsonSchemaObject = Record<string, unknown>;

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

export function buildComponentSchemas(
  definitions: Record<string, ZodTypeAny>,
): Record<string, JsonSchemaObject> {
  // Only the definitions block is wanted, so an empty object is the cheapest carrier.
  const converted = zodToJsonSchema(z.object({}), {
    target: "openApi3",
    definitions,
    definitionPath: "schemas",
    basePath: ["#", "components"],
    // `"none"`, not `"root"`: with `"root"` a reused schema object is referenced by a JSON pointer into another schema
    // (e.g. `#/components/schemas/CreateChildBody/properties/firstName`), which is an illegal OpenAPI `$ref` and renders empty models.
    // Named definitions still become proper component refs; unnamed reuse is duplicated. `document.test.ts` asserts no `$ref` escapes.
    $refStrategy: "none",
  }) as { schemas?: Record<string, JsonSchemaObject> };

  const schemas = converted.schemas;
  if (!schemas) {
    // Unreachable unless zod-to-json-schema moves the definitions block; fail at boot rather than serve dangling `$ref`s.
    throw new Error(
      "zod-to-json-schema returned no definitions block — the `definitionPath` contract changed",
    );
  }
  normalizeNullLiterals(schemas);
  return schemas;
}

export function schemaRef(name: string): JsonSchemaObject {
  return { $ref: `#/components/schemas/${name}` };
}
