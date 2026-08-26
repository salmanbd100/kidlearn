import Anthropic from "@anthropic-ai/sdk";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../../lib/env.js";

/**
 * The Claude API client, and the one shape every generator in files 34–36 calls
 * it through (FR-AI-01..03).
 *
 * **Tool use, never free text.** The model is given exactly one tool whose
 * `input_schema` is the generated JSON Schema of the Zod object the caller will
 * validate against, and `tool_choice` forces it. That removes the whole class of
 * failure where a model wraps JSON in prose, adds a trailing comma, or explains
 * itself first — there is no parsing step to get wrong, because the API returns
 * the arguments already decoded.
 *
 * **One schema, three consumers.** The prompt's contract, the validator that
 * accepts the answer, and the renderer that later draws it are the same Zod
 * object from `@kidlearn/types` (FR-AI-03). Restating the shape in prose inside
 * the prompt would be a second source of truth, and it would drift the first time
 * a question format gained a field.
 *
 * The raw arguments are returned **unvalidated and unparsed**. Validation belongs
 * to `runGenerationJob`, which owns the retry, and the verbatim value is what it
 * stores for audit (FR-AI-08) — narrowing here would throw away the very thing a
 * reviewer needs when a generation goes wrong.
 */

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * Generous rather than tuned. The ceiling exists so a runaway generation fails
 * instead of billing indefinitely, not to shape the output.
 *
 * It has to be generous: on a current model thinking is on by default and its
 * tokens come out of this same allowance, so a bilingual lesson plus five
 * bilingual quiz questions — every option carrying a URL and alt text in both
 * locales — has to fit alongside whatever reasoning the model did first. A
 * ceiling that is merely *probably* enough buys a `max_tokens` stop, which costs
 * a full generation and reads like a schema failure (see `stopReason` below).
 *
 * `output_config: { effort }` would be the other half of this, but it is not
 * accepted by every Sonnet-class snapshot an operator might pin `ANTHROPIC_MODEL`
 * to, and a request that 400s on a config knob is worse than one that thinks more
 * than it needed to.
 */
const MAX_TOKENS = 16000;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Why the model stopped. The SDK's own union, not a restatement of it. */
export type GenerationStopReason = Anthropic.StopReason;

export interface StructuredGeneration {
  /** The tool arguments exactly as the model sent them. Never narrowed here. */
  raw: unknown;
  usage: TokenUsage;
  /**
   * Why the model stopped talking, carried out so the caller can tell a *bad
   * answer* from *no answer*. A `refusal` or a `max_tokens` stop leaves the tool
   * call missing or half-written, which looks exactly like a schema failure from
   * `raw` alone — and retrying either one buys a second identical outcome.
   */
  stopReason: GenerationStopReason | null;
  /** The policy category and explanation, present only on a `refusal` stop. */
  refusal?: string;
}

export interface GenerateStructuredOptions {
  system: string;
  messages: Anthropic.MessageParam[];
  /** Names the tool in the request and in the model's own reasoning about it. */
  toolName: string;
  /** The contract. Converted to the tool's `input_schema`. */
  outputSchema: ZodTypeAny;
}

export async function generateStructured(
  options: GenerateStructuredOptions,
): Promise<StructuredGeneration> {
  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: options.system,
    messages: options.messages,
    tools: [
      {
        name: options.toolName,
        description:
          "Return the generated content. Every field is required and must match the schema exactly.",
        // The SDK types `input_schema` as a JSON Schema object literal, and
        // `zodToJsonSchema` returns the structurally identical but separately
        // declared `JsonSchema7Type`. The cast is at that library boundary and
        // asserts nothing about the value — `target: "jsonSchema7"` is the
        // dialect the Messages API documents for a tool.
        input_schema: zodToJsonSchema(options.outputSchema, {
          target: "jsonSchema7",
          $refStrategy: "none",
        }) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: options.toolName },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");

  return {
    // `null` rather than a throw: a forced tool call that produced no tool block
    // is a failed *generation*, and `runGenerationJob` already knows how to fail
    // a job and keep the attempt for a reviewer to read. Throwing here would lose
    // the token usage this call is billed for.
    raw: toolUse?.input ?? null,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    stopReason: response.stop_reason,
    ...(response.stop_details === null
      ? {}
      : {
          refusal: `${response.stop_details.category ?? "uncategorised"}: ${
            response.stop_details.explanation ?? "no explanation given"
          }`,
        }),
  };
}
