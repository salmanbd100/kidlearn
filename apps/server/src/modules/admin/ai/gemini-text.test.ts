/**
 * The Gemini text client (file 37a, FR-AI-01..03, FR-AI-08).
 *
 * The SDK module is stubbed, which `general.md §5` permits explicitly: an
 * external network boundary is the one allowed mock. Nothing here touches the
 * database, so the Prisma exception does not apply.
 *
 * Two of the four claims below are the regressions a naive port of the Anthropic
 * client would introduce, and neither is visible from the generators' own tests
 * because those stub this module out:
 *
 * 1. A truncated or malformed answer must come back as `raw: null` — a schema
 *    failure `runGenerationJob` retries — and never as a thrown `SyntaxError`,
 *    which that function fails a job on with no second attempt at all.
 * 2. Gemini's `finishReason` taxonomy must arrive as this pipeline's own three
 *    stops, or `describeUnretryableStop` retries a refusal and reports it as
 *    invalid JSON.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
  },
}));

const Schema = z.object({ title: z.string() }).strict();

/** Only the members the client reads, so the SDK's wide response is narrowed here. */
function response(fields: Record<string, unknown>): unknown {
  return {
    text: undefined,
    candidates: [{ finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
    ...fields,
  };
}

async function generate(
  outputSchema: z.ZodTypeAny = Schema,
): Promise<
  Awaited<ReturnType<typeof import("./gemini-text.js").generateStructured>>
> {
  const { generateStructured } = await import("./gemini-text.js");
  return generateStructured({
    system: "You write lessons.",
    messages: [{ role: "user", content: "Write one." }],
    outputSchema,
  });
}

/** The schema Gemini was actually asked for, after the request was built. */
async function requestedSchema(
  outputSchema: z.ZodTypeAny,
): Promise<Record<string, unknown>> {
  sdk.generateContent.mockResolvedValue(response({ text: "{}" }));
  await generate(outputSchema);
  return sdk.generateContent.mock.calls[0][0].config.responseJsonSchema;
}

beforeEach(() => {
  vi.resetModules();
  sdk.generateContent.mockReset();
});

describe("the request", () => {
  it("asks for JSON against the caller's own schema", async () => {
    // The whole of FR-AI-03: the prompt's contract, the validator and the
    // renderer are one Zod object, converted here rather than restated.
    sdk.generateContent.mockResolvedValue(
      response({ text: '{"title":"Counting to five"}' }),
    );

    await generate();

    const call = sdk.generateContent.mock.calls[0][0];
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toMatchObject({
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    });
    expect(call.config.systemInstruction).toBe("You write lessons.");
  });

  it("sends every message as a part of one user turn", async () => {
    // Not one turn per message: Gemini is not documented to merge consecutive
    // same-role turns, and a retry that lost the original prompt would be a retry
    // asking the model to correct something it can no longer see.
    sdk.generateContent.mockResolvedValue(response({ text: "{}" }));
    const { generateStructured } = await import("./gemini-text.js");

    await generateStructured({
      system: "You write lessons.",
      messages: [
        { role: "user", content: "Write one." },
        { role: "user", content: "That failed validation; fix it." },
      ],
      outputSchema: Schema,
    });

    expect(sdk.generateContent.mock.calls[0][0].contents).toEqual([
      {
        role: "user",
        parts: [
          { text: "Write one." },
          { text: "That failed validation; fix it." },
        ],
      },
    ]);
  });

  it("disables thinking, whose tokens come out of the same free-tier limit", async () => {
    sdk.generateContent.mockResolvedValue(response({ text: "{}" }));

    await generate();

    expect(sdk.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
  });
});

describe("the response schema", () => {
  /**
   * Every keyword `responseJsonSchema` accepts, from the field's own declaration
   * in `@google/genai`. Anything outside it is either rejected outright — a root
   * `$schema` answers `400 Unknown name "$schema"` — or silently dropped, which
   * is worse: the constraint is gone and nothing says so.
   */
  const ACCEPTED = new Set([
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

  /** Keyword positions only — the keys under `properties` are the caller's field names. */
  function keywordsIn(node: unknown, insideProperties = false): string[] {
    if (Array.isArray(node))
      return node.flatMap((child) => keywordsIn(child, false));
    if (node === null || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([key, value]) => [
      ...(insideProperties ? [] : [key]),
      ...keywordsIn(
        value,
        !insideProperties && (key === "properties" || key === "$defs"),
      ),
    ]);
  }

  it("sends no keyword the provider does not accept", async () => {
    // `zodToJsonSchema` emits draft-07, which is a superset: `$schema` at the
    // root, and `minLength`/`maxLength` for every bounded string. Handing those
    // over unfiltered is what fails the very first real generation.
    const schema = await requestedSchema(
      z
        .object({
          title: z.string().min(1).max(200),
          objectives: z.array(z.string().min(1)).min(2).max(4),
          score: z.number().int().min(1).max(5),
        })
        .strict(),
    );

    expect(
      [...new Set(keywordsIn(schema))].filter((k) => !ACCEPTED.has(k)),
    ).toEqual([]);
  });

  it("carries a literal discriminator as an enum, the form the provider reads", async () => {
    // `const` is not accepted, and it is the whole of what separates the four
    // question types in `QuizQuestionSchema`. Dropped, the model gets an `anyOf`
    // of indistinguishable branches and Zod rejects whatever it picks.
    const schema = await requestedSchema(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("mcq"), prompt: z.string() }).strict(),
        z.object({ type: z.literal("match_pair"), pairs: z.number() }).strict(),
      ]),
    );

    expect(schema.anyOf).toMatchObject([
      { properties: { type: { enum: ["mcq"] } } },
      { properties: { type: { enum: ["match_pair"] } } },
    ]);
  });

  it("keeps field names that collide with schema keywords", async () => {
    // A lesson has a `description`; a quiz question has a `type`. Filtering
    // keywords without knowing which nesting level is a field name would delete
    // the content itself.
    const schema = await requestedSchema(
      z
        .object({
          description: z.string(),
          type: z.string(),
          const: z.string(),
        })
        .strict(),
    );

    expect(Object.keys(schema.properties as object)).toEqual([
      "description",
      "type",
      "const",
    ]);
  });
});

describe("the answer", () => {
  it("returns the parsed JSON unvalidated, for the caller's schema to judge", async () => {
    sdk.generateContent.mockResolvedValue(
      response({ text: '{"title":"Counting to five","extra":1}' }),
    );

    const result = await generate();

    expect(result.raw).toEqual({ title: "Counting to five", extra: 1 });
  });

  it("reports a malformed answer as no answer rather than throwing", async () => {
    // The regression this file exists for. `runGenerationJob` retries a `raw`
    // that fails `safeParse`, but fails the job outright when `generate` throws —
    // so a `SyntaxError` escaping here would silently spend the one retry the
    // model is supposed to get.
    sdk.generateContent.mockResolvedValue(
      response({
        text: '{"title":"Counting to fi',
        candidates: [{ finishReason: "MAX_TOKENS" }],
      }),
    );

    const result = await generate();

    expect(result.raw).toBeNull();
    expect(result.stopReason).toBe("max_tokens");
  });

  it("reports an empty answer as no answer", async () => {
    sdk.generateContent.mockResolvedValue(response({ text: undefined }));

    await expect(generate()).resolves.toMatchObject({ raw: null });
  });

  it("counts thinking tokens as output, so a raised budget is visible", async () => {
    sdk.generateContent.mockResolvedValue(
      response({
        text: "{}",
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 40,
          thoughtsTokenCount: 60,
        },
      }),
    );

    const result = await generate();

    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 100 });
  });

  it("reports zeroes when the provider sends no usage at all", async () => {
    sdk.generateContent.mockResolvedValue(
      response({ text: "{}", usageMetadata: undefined }),
    );

    const result = await generate();

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("why the model stopped", () => {
  it("maps a normal finish to a normal stop", async () => {
    sdk.generateContent.mockResolvedValue(response({ text: "{}" }));

    await expect(generate()).resolves.toMatchObject({ stopReason: "stop" });
  });

  it("maps the safety family to a refusal, carrying the reason", async () => {
    // `describeUnretryableStop` fails the job on this without a second attempt.
    // A refusal reported as a normal stop would buy an identical refusal.
    for (const finishReason of [
      "SAFETY",
      "PROHIBITED_CONTENT",
      "BLOCKLIST",
      "SPII",
      "RECITATION",
    ]) {
      sdk.generateContent.mockResolvedValue(
        response({ text: undefined, candidates: [{ finishReason }] }),
      );

      const result = await generate();

      expect(result.stopReason).toBe("refusal");
      expect(result.refusal).toBe(`finishReason: ${finishReason}`);
    }
  });

  it("reports a blocked prompt as a refusal, even with no candidate", async () => {
    // The prompt was rejected before generation started, so there is no
    // `candidates[0]` to explain why — reading only the candidate would report
    // this as an ordinary schema failure.
    sdk.generateContent.mockResolvedValue(
      response({
        text: undefined,
        candidates: undefined,
        promptFeedback: { blockReason: "SAFETY" },
      }),
    );

    const result = await generate();

    expect(result.stopReason).toBe("refusal");
    expect(result.refusal).toBe("prompt blocked: SAFETY");
  });

  it("treats an unrecognised finish reason as retryable", async () => {
    // One wasted retry is cheaper than failing a generation the model may have
    // finished, so anything unmapped reports no stop reason at all.
    sdk.generateContent.mockResolvedValue(
      response({ text: "{}", candidates: [{ finishReason: "OTHER" }] }),
    );

    await expect(generate()).resolves.toMatchObject({ stopReason: null });
  });
});
