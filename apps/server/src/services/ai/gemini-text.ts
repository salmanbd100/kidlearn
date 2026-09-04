import type { GenerateContentResponse } from "@google/genai";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { env } from "../../lib/env.js";
import { getClient } from "./google-genai-client.js";
import type { StructuredGeneration } from "./types.js";

/**
 * Gemini text generation, and the one shape every generator in files 34–36 calls
 * it through (FR-AI-01..03).
 *
 * **A response schema, never free text.** `responseJsonSchema` is the generated
 * JSON Schema of the Zod object the caller will validate against, and
 * `responseMimeType: "application/json"` makes it the response format rather
 * than a suggestion. That removes the whole class of failure where a model wraps
 * JSON in prose, opens with an apology, or explains itself first.
 *
 * **One schema, three consumers.** The prompt's contract, the validator that
 * accepts the answer, and the renderer that later draws it are the same Zod
 * object from `@kidlearn/types` (FR-AI-03). Restating the shape in prose inside
 * the prompt would be a second source of truth, and it would drift the first time
 * a question format gained a field.
 *
 * The parsed JSON is returned **unvalidated**. Validation belongs to
 * `runGenerationJob`, which owns the retry, and the verbatim value is what it
 * stores for audit (FR-AI-08) — narrowing here would throw away the very thing a
 * reviewer needs when a generation goes wrong.
 */

/**
 * Generous rather than tuned. The ceiling exists so a runaway generation stops
 * instead of spending the day's free-tier allowance in one call, not to shape the
 * output.
 *
 * It has to be generous: a bilingual lesson plus five bilingual quiz questions —
 * every option carrying a URL and alt text in both locales — has to fit. A
 * ceiling that is merely *probably* enough buys a `MAX_TOKENS` stop, which costs
 * a full generation and arrives looking like a schema failure (see `stopReason`
 * in `types.ts`).
 */
const MAX_OUTPUT_TOKENS = 16000;

/**
 * Thinking off (`0` is the SDK's DISABLED).
 *
 * Extracting a fixed JSON shape does not benefit from extended reasoning the way
 * an open-ended question does, and thinking tokens are billed and rate-limited
 * exactly like output tokens — on a free tier, spending them on reasoning the
 * schema does not need is the wrong default. Left explicit rather than unset
 * because some Flash models still reason by default, which would quietly cost
 * more of the day's allowance per call than this asks for.
 *
 * If lesson or story quality drops, raise this rather than removing it.
 */
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
    // Gemini is not documented to merge consecutive same-role turns the way the
    // Anthropic API is, and a retry whose feedback arrived as a second user turn
    // the model treated as a fresh conversation would be a retry that had lost
    // the prompt.
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
 *
 * `zodToJsonSchema` emits draft-07, which is a superset, and the two answers to a
 * keyword outside this list are both bad: a root `$schema` is rejected outright
 * (`400 Unknown name "$schema"`), and the rest are dropped in silence — the
 * constraint gone with nothing to say so.
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

/**
 * The generated schema, reduced to what the provider reads.
 *
 * **`const` becomes a single-valued `enum`.** It is the one keyword worth
 * translating rather than dropping: `z.literal()` is how every discriminated
 * union in `@kidlearn/types` marks its branches, so a dropped `const` leaves the
 * model choosing between four structurally identical quiz-question shapes and
 * Zod rejecting whichever it picks. `enum` is accepted for strings and numbers,
 * which covers both `type` and `schemaVersion`.
 *
 * **Nesting level decides what a key means.** Under `properties` and `$defs` the
 * keys are the caller's own field names — a lesson has a `description`, a
 * question has a `type` — so filtering them as if they were keywords would
 * delete the content rather than the constraint.
 *
 * Bounds that do not survive (`minLength`, `maxLength`, `pattern`) are still
 * enforced by the Zod parse in `runGenerationJob`; losing them here costs a
 * retry when the model overruns, never a bad row.
 */
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
 *
 * `runGenerationJob` retries an answer that fails `safeParse`, but a `generate`
 * that *throws* fails the job immediately with no second attempt. An answer cut
 * off mid-object — the `MAX_TOKENS` case — would throw a `SyntaxError` out of
 * `JSON.parse` and silently burn the one retry this pipeline exists to give the
 * model, so it is returned as `null` instead: no answer, in the shape the retry
 * loop already understands.
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

/**
 * Gemini's own taxonomy onto the three stops this pipeline acts on.
 *
 * `promptFeedback.blockReason` is checked first because it is the case where
 * there is no candidate at all: the *prompt* was blocked before generation
 * started, and reading `candidates[0]` would find nothing to explain why.
 *
 * Everything unrecognised — `OTHER`, `LANGUAGE`, a reason added after this was
 * written — maps to `null`, which `describeUnretryableStop` treats as retryable.
 * That is the right default: one wasted retry is cheaper than failing a
 * generation the model may have finished.
 */
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
