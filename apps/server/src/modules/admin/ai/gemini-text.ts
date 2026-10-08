import type { GenerateContentResponse, ThinkingLevel } from "@google/genai";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../../../config/env.js";
import { CHILD_SAFETY_SETTINGS, getClient } from "./google-genai-client.js";
import type { StructuredGeneration } from "./types.js";

// Generous ceiling: stops a runaway generation spending the free-tier allowance in one call.
const MAX_OUTPUT_TOKENS = 16000;

// Gemini 3 cannot switch thinking off (`thinkingBudget: 0` is a 400 INVALID_ARGUMENT) and bills it as output,
// so the lowest level keeps the free-tier allowance going furthest.
// Cast, not imported as a value: ThinkingLevel is a TS enum, and a value import would pull the SDK's ~10s
// module evaluation onto the boot path that google-genai-client.ts keeps it off.
const THINKING_LEVEL = "MINIMAL" as ThinkingLevel;

export interface GenerateStructuredOptions {
  system: string;
  /** User turns only, one part each; retry feedback is a second user message (see generators/lesson.ts). */
  messages: { role: "user"; content: string }[];
  outputSchema: ZodTypeAny;
}

export async function generateStructured(
  options: GenerateStructuredOptions,
): Promise<StructuredGeneration> {
  const client = await getClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_TEXT_MODEL,
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
      safetySettings: CHILD_SAFETY_SETTINGS,
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
    },
  });

  const stop = mapFinishReason(response);

  return {
    raw: parseJson(response.text),
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      // Thinking tokens are billed and rate-limited as output, so they count as output.
      outputTokens:
        (response.usageMetadata?.candidatesTokenCount ?? 0) +
        (response.usageMetadata?.thoughtsTokenCount ?? 0),
    },
    stopReason: stop.stopReason,
    ...(stop.refusal === undefined ? {} : { refusal: stop.refusal }),
  };
}

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
      // `unknown` is zodToJsonSchema's return type; the keyword says this value is a field map, which no narrowing reaches.
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

// Malformed JSON is a schema failure, not a throw, so it is retried.
function parseJson(text: string | undefined): unknown {
  if (text === undefined || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type StopMapping = Pick<StructuredGeneration, "stopReason" | "refusal">;

function mapFinishReason(response: GenerateContentResponse): StopMapping {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason !== undefined) {
    return { stopReason: "refusal", refusal: `prompt blocked: ${blockReason}` };
  }

  // Widened to string: comparing with the SDK's FinishReason enum needs a value import (see THINKING_LEVEL).
  const finishReason: string | undefined =
    response.candidates?.[0]?.finishReason;

  switch (finishReason) {
    case "STOP":
      return { stopReason: "stop" };
    case "MAX_TOKENS":
      return { stopReason: "max_tokens" };
    // Safety family: the model declined this prompt; the reason is the reviewer's only diagnosis.
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
