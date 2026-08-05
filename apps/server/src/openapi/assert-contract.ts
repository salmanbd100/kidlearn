import type { ZodTypeAny } from "zod";

/**
 * Asserts a real response body against the schema the OpenAPI document publishes
 * for it. Used by the route tests.
 *
 * This is the half of the drift protection that `coverage.test.ts` cannot provide.
 * Coverage proves every route is *described*; this proves the description is
 * *true*. Without it, a service could start returning a new field, or serialise a
 * timestamp differently, and the page would keep confidently documenting the old
 * shape.
 *
 * The response schemas are `.strict()`, so this fails on an **extra** key as well
 * as a missing one — which is the direction that matters most here, since an
 * accidentally-leaked field (`parentId`, `pinHash`) is a content-safety problem
 * and not merely an inaccurate document.
 *
 * Deliberately free of `vitest` imports so it stays importable from anywhere and
 * is not itself collected as a test.
 */
export function assertContract(
  schema: ZodTypeAny,
  body: unknown,
  operation: string,
): void {
  const result = schema.safeParse(body);
  if (result.success) return;

  const issues = result.error.issues
    .map((issue) => `  ${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Response body does not match the documented contract for ${operation}:\n${issues}\n\n` +
      "Either the response changed and the schema in packages/types/src/api needs updating, " +
      "or the response is wrong. Do not relax the schema to make this pass without checking which.\n\n" +
      `Received: ${JSON.stringify(body, null, 2)}`,
  );
}
