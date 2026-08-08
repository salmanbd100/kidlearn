import {
  COMPONENT_SCHEMAS,
  DEFAULT_SECURITY,
  SECURITY_SCHEMES,
  TAGS,
} from "./components.js";
import { ALL_ROUTE_DOCS } from "./paths/index.js";
import type { JsonSchemaObject } from "./to-json-schema.js";

/**
 * Assembles the OpenAPI document from the route registry.
 *
 * **3.0.3, not 3.1**, and the reason is `nullable`. This API is full of nullable
 * fields; 3.0 spells them `nullable: true`, which `zod-to-json-schema`'s
 * `openApi3` target emits and Swagger UI renders correctly. The 3.1 spelling
 * (`type: ["string","null"]`) renders as an empty type in the UI.
 */

const OPENAPI_VERSION = "3.0.3";

export type OpenApiDocument = {
  openapi: string;
  info: JsonSchemaObject;
  servers: JsonSchemaObject[];
  tags: JsonSchemaObject[];
  security: JsonSchemaObject[];
  paths: Record<string, JsonSchemaObject>;
  components: JsonSchemaObject;
};

const DESCRIPTION = [
  "The kidlearn REST API — a dual-portal learning platform for children aged 3–6.",
  "",
  "### Response envelope",
  "",
  "Every response uses one of exactly two shapes. No endpoint sends a bare body.",
  "",
  "```",
  '2xx      { "data": <payload> }',
  '4xx/5xx  { "error": { "code": <ErrorCode>, "message": string, "details"?: unknown } }',
  "```",
  "",
  "`error.code` is stable and machine-readable — **branch on it, never on `message`**, which is a developer hint and may be reworded. It matters most behind `403`, where five different codes mean five different next screens: `FORBIDDEN`, `CONSENT_REQUIRED`, `PIN_REQUIRED`, `PIN_VERIFICATION_REQUIRED`, `PIN_INVALID`.",
  "",
  "### Authentication",
  "",
  "Google OAuth only, with an httpOnly cookie session — there is no password login, no bearer token, and no sign-up step. Send credentials with every request (`fetch(..., { credentials: 'include' })`); the API accepts one origin only.",
  "",
  "The usual sequence is: `GET /api/auth/google` → `POST /api/parent/consent` → `POST /api/parent/pin` → `POST /api/children` → `POST /api/children/{id}/activate` → the `Content` endpoints.",
  "",
  "Two further gates sit on top of the session, and both are app-level checks rather than authentication:",
  "",
  "- **Active child.** `/api/content/*` needs `POST /api/children/{id}/activate` first. Grade and language are read from that child's row, never from request input.",
  "- **Parental PIN.** A 15-minute grant per session, opened by `POST /api/parent/pin/verify`, required by the destructive parent-account operations.",
  "",
  "### Content safety",
  "",
  "Student-facing reads only ever see rows with `status = published`, filtered to the active child's grade. Unpublished and wrong-grade content answers `404`, identically to content that does not exist — a `403` would confirm the row is there.",
  "",
  "### Reading this spec",
  "",
  "Request schemas are the same Zod objects the server validates with at the route boundary, and response schemas the same ones its tests assert against, both converted at boot. Zod refinements have no JSON Schema equivalent and are lost in that conversion, so where one carries a rule that a caller must know, the rule is restated in the operation's description.",
].join("\n");

/**
 * `serverUrl` is a parameter, not an `env` import, and deliberately so: `lib/env.ts`
 * calls `process.exit(1)` on a missing `.env`, which would kill the
 * `openapi:write` script and make this function untestable.
 */
export function buildOpenApiDocument({
  serverUrl,
}: {
  serverUrl: string;
}): OpenApiDocument {
  const paths: Record<string, JsonSchemaObject> = {};

  for (const { method, path, operation } of ALL_ROUTE_DOCS) {
    const pathItem = paths[path] ?? {};
    if (pathItem[method]) {
      // Two registry entries for the same method+path would silently overwrite
      // each other, publishing one and dropping the other.
      throw new Error(
        `Duplicate OpenAPI operation: ${method.toUpperCase()} ${path}`,
      );
    }
    pathItem[method] = operation;
    paths[path] = pathItem;
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: "kidlearn API",
      version: "0.1.0",
      description: DESCRIPTION,
    },
    servers: [{ url: serverUrl, description: "This server" }],
    tags: TAGS,
    security: DEFAULT_SECURITY,
    paths,
    components: {
      securitySchemes: SECURITY_SCHEMES,
      schemas: COMPONENT_SCHEMAS,
    },
  };
}
