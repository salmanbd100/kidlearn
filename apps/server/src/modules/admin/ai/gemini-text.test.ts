// The SDK module is stubbed (an external network boundary, allowed by general.md §5); no database is touched.
// Two claims are regressions a naive port would introduce, invisible to the generators' tests (they stub this module):
// 1. Truncated or malformed JSON comes back as `raw: null` (retried by runGenerationJob), never a thrown
//    SyntaxError (which fails the job with no second attempt).
// 2. Gemini's finishReason maps to this pipeline's three stops, or describeUnretryableStop retries a refusal.

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
    // FR-AI-03: the prompt's contract, validator and renderer are one Zod object, converted here.
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

  it("blocks at the strictest threshold on every harm category, for a three-to-six audience", async () => {
    sdk.generateContent.mockResolvedValue(response({ text: "{}" }));

    await generate();

    const { safetySettings } = sdk.generateContent.mock.calls[0][0].config;
    expect(safetySettings).toHaveLength(4);
    for (const setting of safetySettings) {
      expect(setting.threshold).toBe("BLOCK_LOW_AND_ABOVE");
    }
    expect(
      safetySettings.map((setting: { category: string }) => setting.category),
    ).toEqual(
      expect.arrayContaining([
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ]),
    );
  });

  it("sends every message as a part of one user turn", async () => {
    // Not one turn per message: Gemini is not documented to merge same-role turns, and a retry that lost the
    // original prompt would ask the model to fix what it can no longer see.
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

  it("asks for the least thinking, whose tokens come out of the same free-tier limit", async () => {
    sdk.generateContent.mockResolvedValue(response({ text: "{}" }));

    await generate();

    // `thinkingBudget: 0` is a 400 on Gemini 3: the scale is named, not numeric, and has no off.
    expect(sdk.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingLevel: "MINIMAL",
    });
  });
});

describe("the response schema", () => {
  // Outside this set a keyword is rejected (a root `$schema` is a 400) or silently dropped, which is worse.
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
    // zodToJsonSchema emits draft-07 (`$schema`, minLength/maxLength); passing those unfiltered fails the first real generation.
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
    // `const` is not accepted but is all that separates the four question types; dropped, Zod rejects whatever the model picks.
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
    // Keywords must be filtered by nesting level: field names like `description` and `type` are content.
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
    // The regression this file exists for: a SyntaxError escaping here fails the job and skips the model's one retry.
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
    // describeUnretryableStop fails the job on this; reporting a refusal as a normal stop would buy an identical refusal.
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
    // Rejected before generation, so there is no candidates[0]; reading only the candidate would report a schema failure.
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
    // One wasted retry is cheaper than failing a generation the model may have finished, so unmapped means no stop reason.
    sdk.generateContent.mockResolvedValue(
      response({ text: "{}", candidates: [{ finishReason: "OTHER" }] }),
    );

    await expect(generate()).resolves.toMatchObject({ stopReason: null });
  });
});
