import { describe, expect, it } from "vitest";
import { isDocsEnabled } from "../lib/env.js";
import { SCHEMA_DEFINITIONS } from "./components.js";
import { buildOpenApiDocument } from "./document.js";
import { EXTERNAL_ROUTE_DOCS, ROUTE_DOCS } from "./paths/index.js";

const document = buildOpenApiDocument({ serverUrl: "http://localhost:4000" });

/** Every operation in the document, flattened, with its location for messages. */
const operations = Object.entries(document.paths).flatMap(([path, pathItem]) =>
  Object.entries(pathItem).map(([method, operation]) => ({
    id: `${method.toUpperCase()} ${path}`,
    operation: operation as Record<string, unknown>,
  })),
);

/** Operations better-auth serves, which this repo documents but does not shape. */
const EXTERNAL_OPERATION_IDS = new Set(
  EXTERNAL_ROUTE_DOCS.map(
    ({ method, path }) => `${method.toUpperCase()} ${path}`,
  ),
);

/** Collects every `$ref` string anywhere in the document. */
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
    // Not 3.1: `nullable: true` is what `zod-to-json-schema` emits and what this
    // document relies on throughout. 3.1 spells it `type: [x, "null"]`, which is a
    // conversion this repo has no reason to make and some readers render as an
    // empty type.
    expect(document.openapi).toBe("3.0.3");
  });

  it("publishes every registry entry and nothing else", () => {
    expect(operations).toHaveLength(
      ROUTE_DOCS.length + EXTERNAL_ROUTE_DOCS.length,
    );
  });

  it("gives every operation a unique operationId", () => {
    // The name a generated client gives the method, and the anchor a `/docs` link
    // points at. Both break silently: a missing id makes a generator invent one
    // from the path, and a duplicate makes it drop or rename a method without
    // saying so. Asserted here so a new route cannot land without one.
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
    // `x-tagGroups` is not additive: a reader that honours it builds its whole
    // navigation from the groups and silently drops a tag no group names. The
    // operations stay in the document and disappear from the page, which is
    // exactly the failure nobody notices — hence both directions.
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
    // An operation may inherit the document-level default (a session cookie) by
    // omitting `security`, which fails closed — a new operation that forgets it is
    // documented as authenticated, not as public. What must not happen is an
    // operation naming a scheme that `components.securitySchemes` does not define:
    // a reader silently offers no way to authenticate it.
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

    // Pinned deliberately: accidentally publishing an endpoint as public is a
    // security regression, and it should have to be written down here to happen.
    expect(publicOperations).toEqual([
      "GET /",
      "GET /api/auth/callback/google",
      "GET /api/auth/google",
      "GET /health",
      // The admin credential endpoints (file 31). Public because they *are* the
      // sign-in: `sign-in/email` is where an admin session comes from, and
      // `sign-up/email` is disabled for every caller regardless.
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
        // 302s carry no body; better-auth's own operations use their own error
        // shapes because they are not ours to envelope. Derived from the registry
        // rather than matched on a path prefix, so documenting another better-auth
        // endpoint (file 31 added the two credential ones) does not mean editing
        // an exclusion list here as well.
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
    // An example is the part of the document a reader copies, and nothing else
    // checks it: JSON Schema conversion drops refinements, and a reader will
    // happily display a sample body that the API could never send. Parsing with
    // the Zod object — the same one the route test asserts the real response
    // against — is what stops a renamed field leaving a plausible-looking lie on
    // the page.
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

    // Guards the walk itself: a refactor that stopped finding examples would
    // otherwise turn this test into an assertion about an empty list.
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
    // The failure this catches is a page that renders with empty models: a reader
    // does not complain about a dangling ref, it just shows nothing.
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
    // These are the reason a frontend engineer can build the engines in files
    // 18–22 from the spec alone, so their presence is asserted rather than hoped.
    const schemas = document.components.schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty("ActivityDefinition");
    expect(schemas).toHaveProperty("QuizQuestion");
  });

  it("describes the session cookie and the job secret, and nothing else", () => {
    // Two schemes since file 30, and the pair is the point: everything a human
    // reaches is the cookie, and the one bearer token belongs to a scheduler that
    // has nobody to sign in as. A third scheme appearing here without a reason in
    // `components.ts` is a credential nobody decided to add.
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
    // The default is what an operation gets by saying nothing, so an operation
    // that forgot its `security` override is documented as cookie-authenticated —
    // wrong in the safe direction for a reader, and worth pinning either way.
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
