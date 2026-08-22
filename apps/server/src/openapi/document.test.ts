import { describe, expect, it } from "vitest";
import { isDocsEnabled } from "../lib/env.js";
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
    // Not 3.1: the `nullable: true` spelling this document relies on throughout
    // is 3.0's, and Swagger UI renders 3.1's `type: [x, "null"]` as an empty type.
    expect(document.openapi).toBe("3.0.3");
  });

  it("publishes every registry entry and nothing else", () => {
    expect(operations).toHaveLength(
      ROUTE_DOCS.length + EXTERNAL_ROUTE_DOCS.length,
    );
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
    // Swagger UI silently offers no way to authenticate it.
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
      "POST /api/auth/sign-in/social",
    ]);
  });

  it("documents the error envelope on every non-2xx response", () => {
    for (const { id, operation } of operations) {
      const responses = (operation.responses ?? {}) as Record<
        string,
        { content?: Record<string, { schema?: { $ref?: string } }> }
      >;

      for (const [status, response] of Object.entries(responses)) {
        // 302s carry no body; better-auth's hand-written operations use their own
        // shapes because they are not ours to envelope.
        const isOurs = !id.startsWith("POST /api/auth/sign-in");
        if (!status.startsWith("4") && !status.startsWith("5")) continue;
        if (!isOurs) continue;

        const ref = response.content?.["application/json"]?.schema?.$ref;
        expect(ref, `${id} → ${status} does not reference ErrorEnvelope`).toBe(
          "#/components/schemas/ErrorEnvelope",
        );
      }
    }
  });

  it("resolves every $ref against components.schemas", () => {
    // The failure this catches is a page that renders with empty models: Swagger
    // UI does not complain about a dangling ref, it just shows nothing.
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
