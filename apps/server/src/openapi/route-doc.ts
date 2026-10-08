import type { JsonSchemaObject } from "./to-json-schema.js";

export type RouteDoc = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  operation: JsonSchemaObject;
};

/** Express writes path parameters as `:id`, OpenAPI as `{id}`; the coverage test converts in this direction. */
export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function pathParam(
  name: string,
  description: string,
  schema: JsonSchemaObject = { type: "string" },
): JsonSchemaObject {
  return { name, in: "path", required: true, description, schema };
}

export function queryParam(
  name: string,
  description: string,
  schema: JsonSchemaObject,
): JsonSchemaObject {
  return { name, in: "query", required: true, description, schema };
}
