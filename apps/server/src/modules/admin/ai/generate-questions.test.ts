/**
 * One call per quiz question (FR-AI-01, FR-AI-03).
 *
 * The Gemini client is mocked, which `general.md §5` permits explicitly: external
 * network boundaries are the one allowed mock.
 */

import { QUIZ_QUESTION_SCHEMAS, validMcq } from "@kidlearn/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ generateStructured: vi.fn() }));

vi.mock("./gemini-text.js", () => ({
  generateStructured: ai.generateStructured,
}));

const { generateQuestions, planQuestionFormats } = await import(
  "./generate-questions.js"
);

const USAGE = { inputTokens: 10, outputTokens: 20 };

function run(overrides: Partial<Parameters<typeof generateQuestions>[0]> = {}) {
  return generateQuestions({
    system: "system prompt",
    formats: ["mcq", "match_pair"],
    buildPrompt: (format, position) =>
      `write question ${position} as ${format}`,
    ...overrides,
  });
}

beforeEach(() => {
  ai.generateStructured.mockReset();
  ai.generateStructured.mockResolvedValue({
    raw: validMcq,
    usage: USAGE,
    stopReason: "stop",
  });
});

describe("planQuestionFormats", () => {
  it("rotates through the four formats so a quiz is a mix, not four of a kind", () => {
    expect(planQuestionFormats(4)).toEqual([
      "mcq",
      "match_pair",
      "drag_answer",
      "picture_select",
    ]);
  });

  it("wraps round once it runs out of formats", () => {
    expect(planQuestionFormats(6)).toEqual([
      "mcq",
      "match_pair",
      "drag_answer",
      "picture_select",
      "mcq",
      "match_pair",
    ]);
  });

  it("still spans three formats at the smallest permitted count", () => {
    expect(new Set(planQuestionFormats(3)).size).toBe(3);
  });
});

describe("generateQuestions", () => {
  it("makes one call per question", async () => {
    await run({ formats: ["mcq", "drag_answer", "picture_select"] });

    expect(ai.generateStructured).toHaveBeenCalledTimes(3);
  });

  it("asks each call for one format only, never the whole union", async () => {
    await run({ formats: ["mcq", "match_pair"] });

    const schemas = ai.generateStructured.mock.calls.map(
      (call) => call[0].outputSchema,
    );
    expect(schemas).toEqual([
      QUIZ_QUESTION_SCHEMAS.mcq,
      QUIZ_QUESTION_SCHEMAS.match_pair,
    ]);
  });

  it("numbers the prompts from one, so the model can vary what it asks", async () => {
    await run({ formats: ["mcq", "match_pair"] });

    expect(
      ai.generateStructured.mock.calls.map((call) => call[0].messages[0]),
    ).toEqual([
      { role: "user", content: "write question 1 as mcq" },
      { role: "user", content: "write question 2 as match_pair" },
    ]);
  });

  it("returns the questions in the order they were asked for", async () => {
    ai.generateStructured
      .mockResolvedValueOnce({
        raw: { n: 1 },
        usage: USAGE,
        stopReason: "stop",
      })
      .mockResolvedValueOnce({
        raw: { n: 2 },
        usage: USAGE,
        stopReason: "stop",
      });

    const result = await run();

    expect(result.questions).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("adds up what every call cost, because the job is billed for all of them", async () => {
    const result = await run({ formats: ["mcq", "match_pair", "drag_answer"] });

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 60 });
  });

  it("appends the retry feedback to every call as a second user message", async () => {
    await run({ formats: ["mcq"], retryFeedback: "that was wrong" });

    expect(ai.generateStructured.mock.calls[0][0].messages).toEqual([
      { role: "user", content: "write question 1 as mcq" },
      { role: "user", content: "that was wrong" },
    ]);
  });

  it("reports a plain stop when every call stopped cleanly", async () => {
    const result = await run();

    expect(result.stopReason).toBe("stop");
  });

  it("surfaces a refusal from any call, so the job is not retried for free", async () => {
    ai.generateStructured
      .mockResolvedValueOnce({
        raw: validMcq,
        usage: USAGE,
        stopReason: "stop",
      })
      .mockResolvedValueOnce({
        raw: null,
        usage: USAGE,
        stopReason: "refusal",
        refusal: "finishReason: SAFETY",
      });

    const result = await run();

    expect(result).toMatchObject({
      stopReason: "refusal",
      refusal: "finishReason: SAFETY",
    });
  });

  it("stops calling once one has refused, rather than paying for the rest", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: null,
      usage: USAGE,
      stopReason: "refusal",
      refusal: "finishReason: SAFETY",
    });

    await run({ formats: ["mcq", "match_pair", "drag_answer"] });

    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("surfaces a cut-off answer the same way", async () => {
    ai.generateStructured.mockResolvedValue({
      raw: null,
      usage: USAGE,
      stopReason: "max_tokens",
    });

    await expect(run()).resolves.toMatchObject({ stopReason: "max_tokens" });
  });
});
