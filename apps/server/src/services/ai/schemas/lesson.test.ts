/**
 * The contract the lesson generator holds the model to (file 34, FR-AI-01).
 *
 * No database and no network — this is a schema, so the tests are the schema's
 * own behaviour. What matters here is the *rejections*: every one of them is a
 * retry the pipeline spends and, if it fails twice, a lesson that never reaches a
 * child half-written.
 */

import { parseQuizQuestion, validMcq } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildLessonGenerationOutputSchema } from "./lesson.js";

function output(overrides: Record<string, unknown> = {}) {
  return {
    title: { en: "The letter A", bn: "A বর্ণ" },
    learningObjectives: ["Recognise the letter A", "Say the /a/ sound"],
    introScript: { en: "Hello!", bn: "হ্যালো!" },
    narrationScript: { en: "A is for apple.", bn: "A মানে আপেল।" },
    quizQuestions: [validMcq, validMcq, validMcq],
    ...overrides,
  };
}

const BOTH = buildLessonGenerationOutputSchema(["en", "bn"]);

describe("a well-formed generation", () => {
  it("parses", () => {
    expect(BOTH.safeParse(output()).success).toBe(true);
  });

  it("holds quiz questions the shared payload parser also accepts", () => {
    // The point of reusing `QuizQuestionSchema` unchanged (FR-AI-03): what the
    // generator accepts is exactly what the renderer will later be handed.
    const parsed = BOTH.parse(output());
    for (const question of parsed.quizQuestions) {
      expect(() => parseQuizQuestion(question)).not.toThrow();
    }
  });
});

describe("locales", () => {
  it("rejects a response missing a requested locale", () => {
    const result = BOTH.safeParse(output({ introScript: { en: "Hello!" } }));

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("bn");
  });

  it("rejects a locale nobody asked for", () => {
    // Strictly, not leniently: a Bangla script generated for an English-only
    // lesson is content no translation row will ever hold, and silently dropping
    // it would bill for words that vanish.
    const englishOnly = buildLessonGenerationOutputSchema(["en"]);

    const result = englishOnly.safeParse(
      output({
        introScript: { en: "Hello!", bn: "হ্যালো!" },
        narrationScript: { en: "A is for apple." },
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts a single-locale response when only one was requested", () => {
    const englishOnly = buildLessonGenerationOutputSchema(["en"]);

    const result = englishOnly.safeParse(
      output({
        title: { en: "The letter A" },
        introScript: { en: "Hello!" },
        narrationScript: { en: "A is for apple." },
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe("the child-facing title", () => {
  it("is required in every requested locale", () => {
    // The whole point of generating it: a missing Bangla title would otherwise be
    // filled from the admin's English focus line (FR-I18N-01).
    const result = BOTH.safeParse(output({ title: { en: "The letter A" } }));

    expect(result.success).toBe(false);
  });

  it("is rejected when it is too long for the column", () => {
    const result = BOTH.safeParse(
      output({ title: { en: "A".repeat(201), bn: "A বর্ণ" } }),
    );

    expect(result.success).toBe(false);
  });
});

describe("the bounds the spec fixes", () => {
  it("rejects two quiz questions", () => {
    const result = BOTH.safeParse(
      output({ quizQuestions: [validMcq, validMcq] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects six quiz questions", () => {
    const result = BOTH.safeParse({
      ...output(),
      quizQuestions: Array.from({ length: 6 }, () => validMcq),
    });

    expect(result.success).toBe(false);
  });

  it("rejects one learning objective and five", () => {
    expect(
      BOTH.safeParse(output({ learningObjectives: ["One"] })).success,
    ).toBe(false);
    expect(
      BOTH.safeParse({
        ...output(),
        learningObjectives: ["a", "b", "c", "d", "e"],
      }).success,
    ).toBe(false);
  });

  it("rejects a quiz question the shared payload schema would reject", () => {
    const result = BOTH.safeParse(
      output({
        quizQuestions: [
          validMcq,
          validMcq,
          { ...validMcq, correctOptionId: "not-an-option" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });
});

describe("the response schema the model is given", () => {
  it("describes the quiz question union rather than an opaque object", () => {
    // The request's `responseJsonSchema` is this conversion
    // (`services/ai/gemini-text.ts`), so the prompt's contract and the acceptance
    // test are one object. Asserted as properties rather than as a stored
    // snapshot, per `general.md §5`.
    const json = zodToJsonSchema(BOTH, {
      target: "jsonSchema7",
      $refStrategy: "none",
    }) as {
      properties: {
        quizQuestions: { items: { anyOf: Array<Record<string, unknown>> } };
        introScript: { required: string[] };
      };
      required: string[];
    };

    expect(json.required.sort()).toEqual([
      "introScript",
      "learningObjectives",
      "narrationScript",
      "quizQuestions",
      "title",
    ]);
    // One branch per question format — mcq, match_pair, drag_answer,
    // picture_select — carried straight through from `QuizQuestionSchema`.
    expect(json.properties.quizQuestions.items.anyOf).toHaveLength(4);
    expect(json.properties.introScript.required.sort()).toEqual(["bn", "en"]);
  });
});
