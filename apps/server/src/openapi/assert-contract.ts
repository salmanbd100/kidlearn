import type { ZodTypeAny } from "zod";

/**
 * Asserts a real response body against the schema the OpenAPI document publishes
 * for it. Used by the route tests.
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
