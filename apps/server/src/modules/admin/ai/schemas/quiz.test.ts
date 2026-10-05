/** The prompt's schema must be the same string as the one the payload contract publishes; compared explicitly because `general.md §5` bans snapshots. */

import {
  QUIZ_QUESTION_SCHEMAS,
  QUIZ_QUESTION_TYPES,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { QUIZ_QUESTION_JSON_SCHEMAS } from "../prompts/quiz.js";
import {
  buildQuizGenerationOutputSchema,
  MIN_DISTINCT_FORMATS,
} from "./quiz.js";

const FOUR = buildQuizGenerationOutputSchema(4);

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
    // Three when four were asked for would quietly change the quiz under review.
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
  it("is byte-identical to the payload contract's own JSON Schema, per format", () => {
    // A second copy of the question contract in the prompt would drift when a format gains a field.
    for (const type of QUIZ_QUESTION_TYPES) {
      const expected = JSON.stringify(
        zodToJsonSchema(QUIZ_QUESTION_SCHEMAS[type], {
          target: "jsonSchema7",
          $refStrategy: "none",
        }),
        null,
        2,
      );

      expect(QUIZ_QUESTION_JSON_SCHEMAS[type]).toBe(expected);
    }
  });

  it("quotes one format per prompt, because a question is asked for one at a time", () => {
    // The four-format union exceeds `responseJsonSchema`, so each prompt carries only its own format.
    expect(QUIZ_QUESTION_JSON_SCHEMAS.mcq).toContain('"mcq"');
    expect(QUIZ_QUESTION_JSON_SCHEMAS.mcq).not.toContain('"match_pair"');
  });

  it("inlines every format rather than referencing it", () => {
    // `$refStrategy: "none"`: a `$ref` into a `definitions` block the message does not carry would describe nothing.
    for (const type of QUIZ_QUESTION_TYPES) {
      expect(QUIZ_QUESTION_JSON_SCHEMAS[type]).toContain(`"${type}"`);
      expect(QUIZ_QUESTION_JSON_SCHEMAS[type]).not.toContain('"$ref"');
    }
  });
});
