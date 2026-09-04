import type { JsonSchemaObject } from "./to-json-schema.js";

/** One documented operation. */
export type RouteDoc = {
  method: "get" | "post" | "patch" | "delete";
  /** OpenAPI-style, with braces: `/api/children/{id}`, not `/api/children/:id`. */
  path: string;
  operation: JsonSchemaObject;
};

/**
 * Express writes path parameters as `:id`; OpenAPI writes them as `{id}`. The
 * coverage test converts in this direction and compares, so this is the only
 * place the two notations meet.
 */
export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** A required path parameter. */
export function pathParam(
  name: string,
  description: string,
  schema: JsonSchemaObject = { type: "string" },
): JsonSchemaObject {
  return { name, in: "path", required: true, description, schema };
}

/** A required query parameter. */
export function queryParam(
  name: string,
  description: string,
  schema: JsonSchemaObject,
): JsonSchemaObject {
  return { name, in: "query", required: true, description, schema };
}
