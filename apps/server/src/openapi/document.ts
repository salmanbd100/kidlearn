import {
  COMPONENT_SCHEMAS,
  DEFAULT_SECURITY,
  SECURITY_SCHEMES,
  TAG_GROUPS,
  TAGS,
} from "./components.js";
import { ALL_ROUTE_DOCS } from "./paths/index.js";
import type { JsonSchemaObject } from "./to-json-schema.js";

// Assembles the OpenAPI document from the route registry.

const OPENAPI_VERSION = "3.0.3";

export type OpenApiDocument = {
  openapi: string;
  info: JsonSchemaObject;
  servers: JsonSchemaObject[];
  tags: JsonSchemaObject[];
  /** Sidebar grouping. Readers that do not know the extension ignore it. */
  "x-tagGroups": JsonSchemaObject[];
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
  "#### Native clients",
  "",
  "**A native app cannot sign in against this server yet, and the reason is here rather than in a changelog because the fix is a server change on a known milestone.** `trustedOrigins` currently holds the web origin alone, better-auth is registered without its Expo plugin, and the Google callback hardcodes a web URL a phone cannot follow back into the app. Mobile milestone `M06` adds all three; until it lands, every native sign-in is refused as an untrusted origin.",
  "",
  "What will **not** change is the credential: mobile keeps this same httpOnly cookie session, so **do not wait for a bearer token — none is planned**. The Expo client stores the cookie in the device keychain and attaches it itself, which has one consequence worth designing around now: `credentials: 'include'` is a no-op on native, so every call must go through the one wrapper that adds the cookie rather than calling `fetch` directly. Both gates above — the active child and the PIN grant — stay server-side and are unchanged on native.",
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
    servers: [
      { url: serverUrl, description: "This server" },
      // Documented before they exist. Both hosts are specified in
      // `project-requirement-details.md §9` but implementation file 38 has not
      // run, so neither resolves yet — hence descriptions that say so rather
      // than a **Send** that times out with no explanation. A mobile build
      // needs these two values for `EXPO_PUBLIC_API_URL` well before it needs
      // them to answer.
      {
        url: "https://api.dev.kidlearn.net",
        description: "Development — tracks the `dev` branch. Not yet deployed.",
      },
      {
        url: "https://api.kidlearn.net",
        description: "Production — tracks `main`. Not yet deployed.",
      },
    ],
    tags: TAGS,
    "x-tagGroups": TAG_GROUPS,
    security: DEFAULT_SECURITY,
    paths,
    components: {
      securitySchemes: SECURITY_SCHEMES,
      schemas: COMPONENT_SCHEMAS,
    },
  };
}
