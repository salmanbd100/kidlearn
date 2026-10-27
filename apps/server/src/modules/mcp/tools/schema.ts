import type {
  CallToolResult,
  JsonSchemaValidatorResult,
  jsonSchemaValidator,
  StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ApiError } from "../../../shared/errors/errors.js";
import { flatten } from "../../admin/ai/run-generation-job.js";
import type { McpCaller } from "../mcp.server.js";

/**
 * The SDK takes Zod 4 or a JSON-Schema-backed standard schema; the workspace is on Zod 3 (file 41, fact 3), so
 * tools advertise the JSON Schema our own schemas convert to and the handler re-parses with the Zod 3 original.
 * The SDK's own pass is switched off: it would answer a bad call before the handler runs, so the invalid submission
 * would never be logged (Req. 9), and the model would read AJV's message instead of our path-level issues.
 */
export function toToolInputSchema(
  schema: ZodTypeAny,
): StandardSchemaWithJSON<unknown, unknown> {
  return fromJsonSchema(toObjectJsonSchema(schema), DEFER_TO_HANDLER);
}

/** Prompt handlers parse with `.parse()`, so a prompt keeps the SDK's validation in front of them. */
export function toPromptArgsSchema(
  schema: ZodTypeAny,
): StandardSchemaWithJSON<unknown, unknown> {
  return fromJsonSchema(toObjectJsonSchema(schema));
}

const DEFER_TO_HANDLER: jsonSchemaValidator = {
  getValidator:
    <T>() =>
    (
      input: unknown,
    ): JsonSchemaValidatorResult<T> => // Not validated here by design: every tool handler's `parseArgs` is the authority and narrows it.
    ({ valid: true, data: input as T, errorMessage: undefined }),
};

function toObjectJsonSchema(
  schema: ZodTypeAny,
): Parameters<typeof fromJsonSchema>[0] {
  const json = zodToJsonSchema(schema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });
  // `zodToJsonSchema` types its result as a union including `$schema`-only shapes; an object schema converts to an object schema.
  const { $schema: _dialect, ...objectSchema } = json as Record<
    string,
    unknown
  >;
  return objectSchema as Parameters<typeof fromJsonSchema>[0];
}

export function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/** Tool output is data for the model to read, never instructions; the JSON fence says so structurally. */
export function toolResult<T extends Record<string, unknown>>(
  structuredContent: T,
  summary?: string,
): CallToolResult {
  const json = JSON.stringify(structuredContent, null, 2);
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text:
          summary === undefined
            ? json
            : `${summary}\n\n\`\`\`json\n${json}\n\`\`\``,
      },
    ],
  };
}

/** Parses tool arguments with the Zod 3 schema; a failure is a tool error the model can act on, not a protocol error. */
export function parseArgs<S extends ZodTypeAny>(
  schema: S,
  args: unknown,
): { ok: true; value: z.infer<S> } | { ok: false; result: CallToolResult } {
  const parsed = schema.safeParse(args ?? {});
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    result: toolError(`Invalid arguments:\n${flatten(parsed.error)}`),
  };
}

export const INTERNAL_TOOL_ERROR =
  "KidLearn hit an internal error and nothing was saved. Try again; if you sent a clientRequestId, send the same one.";

/**
 * The 404s, 409s and 429s the REST path throws, as tool errors the model can act on. Anything else is logged here
 * and answered with a fixed message: the SDK would otherwise turn the throw into a tool result carrying the raw
 * error text (a Prisma message names tables and columns) and nothing would reach the logs.
 */
export async function asToolErrors(
  caller: McpCaller,
  tool: string,
  run: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError && error.statusCode < 500) {
      return toolError(error.message);
    }
    caller.log.error({ err: error, tool }, "mcp tool failed");
    return toolError(INTERNAL_TOOL_ERROR);
  }
}

/**
 * `asToolErrors` for prompts, which answer with a JSON-RPC error rather than an `isError` result. A 4xx keeps its
 * message for the model to act on; anything else is logged and replaced, so Prisma's text never reaches the client.
 */
export async function asPromptErrors<T>(
  caller: McpCaller,
  prompt: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError && error.statusCode < 500) {
      throw new Error(error.message);
    }
    // The comma-separated arguments are split and checked after the SDK's own pass, so a bad grade lands here.
    if (error instanceof ZodError) {
      throw new Error(`Invalid arguments:\n${flatten(error)}`);
    }
    caller.log.error({ err: error, prompt }, "mcp prompt failed");
    throw new Error(INTERNAL_PROMPT_ERROR);
  }
}

export const INTERNAL_PROMPT_ERROR =
  "KidLearn hit an internal error building this prompt. Try again, or call get_authoring_guide instead.";
