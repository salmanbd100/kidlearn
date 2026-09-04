import type { GenerateContentResponse } from "@google/genai";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../../lib/env.js";
import { getClient } from "./google-genai-client.js";
import type { StructuredGeneration } from "./types.js";

/**
 * Gemini text generation, and the one shape every generator in files 34–36 calls
 * it through (FR-AI-01..03).
 */

/**
 * Generous rather than tuned. The ceiling exists so a runaway generation stops
 * instead of spending the day's free-tier allowance in one call, not to shape the
 * output.
 */
const MAX_OUTPUT_TOKENS = 16000;

/** Thinking off (`0` is the SDK's DISABLED). */
const THINKING_BUDGET = 0;

export interface GenerateStructuredOptions {
  system: string;
  /**
   * Only user turns, and one part each. The retry feedback is a second user
   * message rather than a replay of the rejected answer — see
   * `generators/lesson.ts` for why — so nothing here ever needs a model turn.
   */
  messages: { role: "user"; content: string }[];
  /** The contract. Converted to the response schema. */
  outputSchema: ZodTypeAny;
}

export async function generateStructured(
  options: GenerateStructuredOptions,
): Promise<StructuredGeneration> {
  const client = await getClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_TEXT_MODEL,
    // One turn carrying one part per message, rather than one turn per message.
    contents: [
      {
        role: "user",
        parts: options.messages.map(({ content }) => ({ text: content })),
      },
    ],
    config: {
      systemInstruction: options.system,
      responseMimeType: "application/json",
      responseJsonSchema: toResponseJsonSchema(options.outputSchema),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
    },
  });

  const stop = mapFinishReason(response);

  return {
    raw: parseJson(response.text),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      // Thinking tokens are counted as output because they are billed and
      // rate-limited as output. They are zero while `THINKING_BUDGET` is, and an
      // operator who raises it should see what it cost rather than a total that
      // silently stops adding up (FR-AI-08).
      outputTokens:
        (response.usageMetadata?.candidatesTokenCount ?? 0) +
        (response.usageMetadata?.thoughtsTokenCount ?? 0),
    },
    stopReason: stop.stopReason,
    ...(stop.refusal === undefined ? {} : { refusal: stop.refusal }),
  };
}

/**
 * Every keyword `responseJsonSchema` accepts, from the field's own declaration in
 * `@google/genai`.
 */
const ACCEPTED_KEYWORDS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

/** Keywords whose value is a map of *field name* to sub-schema, not more keywords. */
const SUBSCHEMA_MAPS = new Set(["properties", "$defs"]);

/** Keywords whose value is a sub-schema, or a list of them. */
const SUBSCHEMAS = new Set([
  "items",
  "prefixItems",
  "additionalProperties",
  "anyOf",
  "oneOf",
]);

function toResponseJsonSchema(schema: ZodTypeAny): unknown {
  return accepted(
    zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }),
  );
}

/** The generated schema, reduced to what the provider reads. */
function accepted(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(accepted);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [keyword, value] of Object.entries(node)) {
    if (keyword === "const") {
      out.enum = [value];
      continue;
    }
    if (!ACCEPTED_KEYWORDS.has(keyword)) continue;

    if (SUBSCHEMA_MAPS.has(keyword)) {
      // `unknown` here is `zodToJsonSchema`'s own return type, and the keyword
      // is what says this particular value is a map of field names. No narrowing
      // can reach that: it is a fact about the JSON Schema spec, not the type.
      out[keyword] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([field, sub]) => [
          field,
          accepted(sub),
        ]),
      );
    } else if (SUBSCHEMAS.has(keyword)) {
      out[keyword] = accepted(value);
    } else {
      out[keyword] = value;
    }
  }
  return out;
}

/**
 * Malformed JSON is a schema failure, not a thrown error — and the distinction is
 * a retry.
 */
function parseJson(text: string | undefined): unknown {
  if (text === undefined || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type StopMapping = Pick<StructuredGeneration, "stopReason" | "refusal">;

/** Gemini's own taxonomy onto the three stops this pipeline acts on. */
function mapFinishReason(response: GenerateContentResponse): StopMapping {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason !== undefined) {
    return { stopReason: "refusal", refusal: `prompt blocked: ${blockReason}` };
  }

  // Widened to `string` deliberately: the SDK types this as its own `FinishReason`
  // enum, and comparing against the enum's members would mean importing the SDK's
  // *value* here — the ten seconds of module evaluation `google-genai-client.ts`
  // exists to keep off the boot path (NFR-PERF-04).
  const finishReason: string | undefined =
    response.candidates?.[0]?.finishReason;

  switch (finishReason) {
    case "STOP":
      return { stopReason: "stop" };
    case "MAX_TOKENS":
      return { stopReason: "max_tokens" };
    // The safety family: every one of them means the model declined this prompt.
    // The reason is carried verbatim because it is the only diagnosis a reviewer
    // gets (FR-AI-08).
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
    case "RECITATION":
      return {
        stopReason: "refusal",
        refusal: `finishReason: ${finishReason}`,
      };
    default:
      return { stopReason: null };
  }
}
