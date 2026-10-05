import { describe, expect, it } from "vitest";
import { isDocsEnabled } from "../config/env.js";
import { SCHEMA_DEFINITIONS } from "./components.js";
import { buildOpenApiDocument } from "./document.js";
import { EXTERNAL_ROUTE_DOCS, ROUTE_DOCS } from "./paths/index.js";

const document = buildOpenApiDocument({ serverUrl: "http://localhost:4000" });

const operations = Object.entries(document.paths).flatMap(([path, pathItem]) =>
  Object.entries(pathItem).map(([method, operation]) => ({
    id: `${method.toUpperCase()} ${path}`,
    operation: operation as Record<string, unknown>,
  })),
);

const EXTERNAL_OPERATION_IDS = new Set(
  EXTERNAL_ROUTE_DOCS.map(
    ({ method, path }) => `${method.toUpperCase()} ${path}`,
  ),
);

function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;

  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") found.push(value);
    else collectRefs(value, found);
  }
  return found;
}

describe("openapi document", () => {
  it("is OpenAPI 3.0.3", () => {
    // Not 3.1: `nullable: true` is what `zod-to-json-schema` emits, and 3.1's `type: [x, "null"]` renders as an empty type in some readers.
    expect(document.openapi).toBe("3.0.3");
  });

  it("publishes every registry entry and nothing else", () => {
    expect(operations).toHaveLength(
      ROUTE_DOCS.length + EXTERNAL_ROUTE_DOCS.length,
    );
  });

  it("gives every operation a unique operationId", () => {
    // A missing id makes a generator invent one from the path; a duplicate makes it drop or rename a method.
    const ids = operations.map(({ id, operation }) => {
      expect(operation.operationId, `${id} has no operationId`).toBeTruthy();
      return operation.operationId as string;
    });

    const duplicates = ids.filter(
      (value, index) => ids.indexOf(value) !== index,
    );
    expect(
      duplicates,
      `Duplicate operationId(s): ${duplicates.join(", ")}`,
    ).toEqual([]);
  });

  it("puts every tag in exactly one sidebar group", () => {
    // A reader that honours `x-tagGroups` silently drops any tag no group names, hence both directions.
    const declared = (document.tags as Array<{ name: string }>).map(
      (t) => t.name,
    );
    const grouped = (
      document["x-tagGroups"] as Array<{ tags: string[] }>
    ).flatMap((group) => group.tags);

    expect([...grouped].sort()).toEqual([...declared].sort());

    const usedByOperations = new Set(
      operations.flatMap(({ operation }) => (operation.tags ?? []) as string[]),
    );
    for (const tag of usedByOperations) {
      expect(
        declared,
        `Operation tag "${tag}" is not declared in TAGS`,
      ).toContain(tag);
    }
  });

  it("gives every operation a summary, a tag, and a documented response", () => {
    for (const { id, operation } of operations) {
      expect(operation.summary, `${id} has no summary`).toBeTruthy();
      expect(operation.tags, `${id} has no tags`).toBeTruthy();
      expect(
        Object.keys((operation.responses ?? {}) as object).length,
        `${id} documents no responses`,
      ).toBeGreaterThan(0);
    }
  });

  it("uses only the declared security scheme, or none at all", () => {
    // An omitted `security` inherits the cookie default and fails closed; a scheme missing from `securitySchemes` leaves a reader with no way to authenticate.
    const declaredSchemes = Object.keys(
      document.components.securitySchemes as object,
    );

    for (const { id, operation } of operations) {
      if (!("security" in operation)) continue;
      const requirements = operation.security as Array<Record<string, unknown>>;
      expect(
        Array.isArray(requirements),
        `${id} has a malformed security`,
      ).toBe(true);

      for (const requirement of requirements) {
        for (const scheme of Object.keys(requirement)) {
          expect(
            declaredSchemes,
            `${id} requires the undeclared security scheme "${scheme}"`,
          ).toContain(scheme);
        }
      }
    }
  });

  it("marks exactly the public operations as unauthenticated", () => {
    const publicOperations = operations
      .filter(
        ({ operation }) =>
          Array.isArray(operation.security) &&
          (operation.security as unknown[]).length === 0,
      )
      .map(({ id }) => id)
      .sort();

    // Pinned: accidentally publishing an endpoint as public is a security regression and must be written down here.
    expect(publicOperations).toEqual([
      "GET /",
      "GET /api/auth/callback/google",
      "GET /api/auth/google",
      "GET /health",
      "GET /ready",
      // Public because they are the sign-in; `sign-up/email` is disabled for every caller.
      "POST /api/auth/sign-in/email",
      "POST /api/auth/sign-in/social",
      "POST /api/auth/sign-up/email",
    ]);
  });

  it("documents the error envelope on every non-2xx response", () => {
    for (const { id, operation } of operations) {
      const responses = (operation.responses ?? {}) as Record<
        string,
        { content?: Record<string, { schema?: { $ref?: string } }> }
      >;

      for (const [status, response] of Object.entries(responses)) {
        // 302s carry no body, and better-auth's own operations use their own error shapes; derived from the registry, not a path prefix.
        if (!status.startsWith("4") && !status.startsWith("5")) continue;
        if (!EXTERNAL_OPERATION_IDS.has(id)) {
          const ref = response.content?.["application/json"]?.schema?.$ref;
          expect(
            ref,
            `${id} → ${status} does not reference ErrorEnvelope`,
          ).toBe("#/components/schemas/ErrorEnvelope");
        }
      }
    }
  });

  it("parses every hand-written example against its own schema", () => {
    // JSON Schema conversion drops refinements, so parsing with the Zod object stops a renamed field leaving a plausible-looking lie on the page.
    const examples: Array<{ id: string; schema: string; value: unknown }> = [];

    for (const { id, operation } of operations) {
      const responses = (operation.responses ?? {}) as Record<
        string,
        {
          content?: Record<
            string,
            { schema?: { $ref?: string }; example?: unknown }
          >;
        }
      >;

      for (const [status, response] of Object.entries(responses)) {
        const media = response.content?.["application/json"];
        if (!media || media.example === undefined) continue;
        const ref = media.schema?.$ref;
        expect(
          ref,
          `${id} → ${status} has an example but no $ref`,
        ).toBeTruthy();
        examples.push({
          id: `${id} → ${status}`,
          schema: (ref as string).replace("#/components/schemas/", ""),
          value: media.example,
        });
      }
    }

    // Guards the walk itself: otherwise a refactor that found no examples would assert on an empty list.
    expect(examples.length).toBeGreaterThan(50);

    for (const { id, schema, value } of examples) {
      const zodSchema = SCHEMA_DEFINITIONS[schema];
      expect(
        zodSchema,
        `${id} references unregistered schema ${schema}`,
      ).toBeTruthy();

      const result = zodSchema.safeParse(value);
      expect(
        result.success,
        `${id} example does not satisfy ${schema}: ${
          result.success ? "" : JSON.stringify(result.error.flatten(), null, 2)
        }`,
      ).toBe(true);
    }
  });

  it("resolves every $ref against components.schemas", () => {
    // A dangling ref makes a reader render empty models without complaint.
    const schemas = (document.components.schemas ?? {}) as Record<
      string,
      unknown
    >;
    const dangling = [...new Set(collectRefs(document))].filter((ref) => {
      const name = ref.replace("#/components/schemas/", "");
      return ref.startsWith("#/components/schemas/")
        ? !(name in schemas)
        : true;
    });

    expect(dangling, `Unresolvable $ref(s): ${dangling.join(", ")}`).toEqual(
      [],
    );
  });

  it("registers the activity and quiz payload contracts", () => {
    // The activity and quiz payload schemas are what frontend engines are built from, so their presence is asserted.
    const schemas = document.components.schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty("ActivityDefinition");
    expect(schemas).toHaveProperty("QuizQuestion");
  });

  it("describes the session cookie and the job secret, and nothing else", () => {
    // Everything human is the cookie; the one bearer token belongs to a scheduler. A third scheme needs a reason in `components.ts`.
    expect(document.components.securitySchemes).toEqual({
      sessionCookie: expect.objectContaining({
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      }),
      cronSecret: expect.objectContaining({ type: "http", scheme: "bearer" }),
    });
  });

  it("applies the session cookie by default and the job secret only to jobs", () => {
    // An operation that forgot its `security` override is documented as cookie-authenticated, which is the safe direction.
    expect(document.security).toEqual([{ sessionCookie: [] }]);

    const jobOperations = Object.entries(document.paths).filter(([path]) =>
      path.startsWith("/api/admin/jobs/"),
    );
    expect(jobOperations.length).toBeGreaterThan(0);

    for (const [, pathItem] of jobOperations) {
      for (const operation of Object.values(pathItem)) {
        expect((operation as { security?: unknown }).security).toEqual([
          { cronSecret: [] },
        ]);
      }
    }
  });
});

describe("isDocsEnabled", () => {
  it("serves the docs outside production regardless of the flag", () => {
    expect(
      isDocsEnabled({ NODE_ENV: "development", ENABLE_API_DOCS: false }),
    ).toBe(true);
    expect(isDocsEnabled({ NODE_ENV: "test", ENABLE_API_DOCS: false })).toBe(
      true,
    );
  });

  it("hides the docs in production unless explicitly enabled", () => {
    expect(
      isDocsEnabled({ NODE_ENV: "production", ENABLE_API_DOCS: false }),
    ).toBe(false);
    expect(
      isDocsEnabled({ NODE_ENV: "production", ENABLE_API_DOCS: true }),
    ).toBe(true);
  });
});
