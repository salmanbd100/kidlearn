/**
 * The contract the quiz generator holds the model to (file 35, FR-AI-03).
 *
 * The questions themselves are `QuizQuestionSchema` from `@kidlearn/types` and are
 * tested there; what is tested here is the two rules this file adds — the exact
 * count and the format spread — plus the claim the whole design rests on: that the
 * schema in the prompt is the same object, byte for byte, as the one the payload
 * contract publishes.
 *
 * That last assertion is written as an explicit comparison rather than a Vitest
 * snapshot, because `general.md §5` bans snapshot tests. Nothing is lost: what
 * needs proving is not "the schema still looks like it did" but "these two strings
 * are the same string", and a snapshot would answer a different question and rot
 * on every legitimate schema change.
 */

import {
  QUIZ_QUESTION_TYPES,
  QuizQuestionSchema,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { QUIZ_QUESTION_JSON_SCHEMA } from "../prompts/quiz.js";
import {
  buildQuizGenerationOutputSchema,
  MIN_DISTINCT_FORMATS,
} from "./quiz.js";

const FOUR = buildQuizGenerationOutputSchema(4);

/** Four questions using four formats — the shape the prompt asks for. */
function questions() {
  return [validMcq, validMatchPair, validDragAnswer, validPictureSelect];
}

describe("a well-formed set", () => {
  it("parses", () => {
    expect(FOUR.safeParse({ questions: questions() }).success).toBe(true);
  });

  it("accepts three of the four formats", () => {
    const result = FOUR.safeParse({
      questions: [validMcq, validMcq, validMatchPair, validDragAnswer],
    });

    expect(result.success).toBe(true);
  });
});

describe("the count", () => {
  it("rejects fewer questions than were commissioned", () => {
    // The admin named a number. Three when four were asked for would quietly
    // change the quiz they thought they were reviewing.
    const result = FOUR.safeParse({ questions: questions().slice(0, 3) });

    expect(result.success).toBe(false);
  });

  it("rejects more questions than were commissioned", () => {
    const result = FOUR.safeParse({
      questions: [...questions(), validMcq],
    });

    expect(result.success).toBe(false);
  });

  it("binds to the count it was built with", () => {
    const three = buildQuizGenerationOutputSchema(3);

    expect(
      three.safeParse({ questions: questions().slice(0, 3) }).success,
    ).toBe(true);
    expect(three.safeParse({ questions: questions() }).success).toBe(false);
  });
});

describe("the format spread", () => {
  it("rejects a set that leans on one format", () => {
    const result = FOUR.safeParse({
      questions: [validMcq, validMcq, validMcq, validMcq],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain(`${MIN_DISTINCT_FORMATS}`);
  });

  it("names the formats the model could have used, so the retry can act on it", () => {
    const result = FOUR.safeParse({
      questions: [validMcq, validMcq, validMcq, validMatchPair],
    });

    expect(result.success).toBe(false);
    for (const type of QUIZ_QUESTION_TYPES) {
      expect(String(result.error)).toContain(type);
    }
  });
});

describe("the questions themselves", () => {
  it("rejects an mcq with too few options", () => {
    // FR-QUIZ-01's floor of three, enforced by the shared union rather than
    // restated here — the point of embedding it unchanged.
    const result = FOUR.safeParse({
      questions: [
        { ...validMcq, options: validMcq.options.slice(0, 2) },
        validMatchPair,
        validDragAnswer,
        validPictureSelect,
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an answer key naming an option that is not on screen", () => {
    const result = FOUR.safeParse({
      questions: [
        { ...validMcq, correctOptionId: "banana" },
        validMatchPair,
        validDragAnswer,
        validPictureSelect,
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("the schema embedded in the prompt", () => {
  it("is byte-identical to the payload contract's own JSON Schema", () => {
    // The acceptance criterion for FR-AI-03: one schema, three consumers. If this
    // fails, the prompt has grown a second copy of the question contract and the
    // two will drift the first time a format gains a field.
    const expected = JSON.stringify(
      zodToJsonSchema(QuizQuestionSchema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      }),
      null,
      2,
    );

    expect(QUIZ_QUESTION_JSON_SCHEMA).toBe(expected);
  });

  it("carries every question format, inlined rather than referenced", () => {
    // `$refStrategy: "none"` is what makes the embedded document readable on its
    // own: a `$ref` into a `definitions` block the message does not carry would
    // describe nothing.
    for (const type of QUIZ_QUESTION_TYPES) {
      expect(QUIZ_QUESTION_JSON_SCHEMA).toContain(`"${type}"`);
    }
    expect(QUIZ_QUESTION_JSON_SCHEMA).not.toContain('"$ref"');
  });
});
