import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  invalidDragAnswerMissingBlank,
  invalidDragAnswerTwoBlanks,
  invalidMatchPairReusedLeftId,
  invalidMatchPairUnknownRightId,
  invalidMcqBadCorrectId,
  invalidMcqMissingBanglaPrompt,
  invalidMcqTooFewOptions,
  invalidMcqWrongVersion,
  invalidPictureSelectBadCorrectId,
  invalidPictureSelectMissingImage,
  invalidQuizUnknownType,
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "../__fixtures__/quiz.js";
import { parseQuizQuestion, safeParseQuizQuestion } from "./parse.js";
import {
  DragAnswerQuestionSchema,
  MatchPairQuestionSchema,
  McqQuestionSchema,
  PictureSelectQuestionSchema,
  QUIZ_QUESTION_TYPES,
} from "./schemas.js";

/** One valid fixture per union member — the coverage test below depends on that. */
const VALID_QUIZ_FIXTURES = [
  ["mcq", validMcq],
  ["match_pair", validMatchPair],
  ["drag_answer", validDragAnswer],
  ["picture_select", validPictureSelect],
] as const;

describe("McqQuestionSchema", () => {
  it("parses a valid multiple-choice question", () => {
    expect(McqQuestionSchema.parse(validMcq)).toEqual(validMcq);
  });

  it("rejects a correctOptionId that is not among the options", () => {
    expect(McqQuestionSchema.safeParse(invalidMcqBadCorrectId).success).toBe(
      false,
    );
  });

  it("rejects fewer than three options", () => {
    expect(McqQuestionSchema.safeParse(invalidMcqTooFewOptions).success).toBe(
      false,
    );
  });

  it("rejects more than four options", () => {
    const result = McqQuestionSchema.safeParse({
      ...validMcq,
      options: [
        ...validMcq.options,
        { id: "grass", text: { en: "Grass", bn: "ঘাস" } },
        { id: "cloud", text: { en: "Cloud", bn: "মেঘ" } },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a prompt missing the bn locale", () => {
    expect(
      McqQuestionSchema.safeParse(invalidMcqMissingBanglaPrompt).success,
    ).toBe(false);
  });

  it("rejects a question without prompt audio", () => {
    const { promptAudio: _promptAudio, ...withoutAudio } = validMcq;
    expect(McqQuestionSchema.safeParse(withoutAudio).success).toBe(false);
  });

  it("rejects an option with neither text nor image", () => {
    const result = McqQuestionSchema.safeParse({
      ...validMcq,
      options: [{ id: "apple" }, validMcq.options[1], validMcq.options[2]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate option ids", () => {
    const result = McqQuestionSchema.safeParse({
      ...validMcq,
      options: [validMcq.options[0], validMcq.options[0], validMcq.options[2]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    expect(McqQuestionSchema.safeParse(invalidMcqWrongVersion).success).toBe(
      false,
    );
  });

  it("rejects an unknown top-level key instead of stripping it", () => {
    const result = McqQuestionSchema.safeParse({
      ...validMcq,
      explanation: { en: "Apples are red", bn: "আপেল লাল" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key on an option", () => {
    const result = McqQuestionSchema.safeParse({
      ...validMcq,
      options: [
        { ...validMcq.options[0], isCorrect: true },
        validMcq.options[1],
        validMcq.options[2],
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("MatchPairQuestionSchema", () => {
  it("parses a valid match-pair question", () => {
    expect(MatchPairQuestionSchema.parse(validMatchPair)).toEqual(
      validMatchPair,
    );
  });

  it("rejects a pair referencing an unknown right-column id", () => {
    expect(
      MatchPairQuestionSchema.safeParse(invalidMatchPairUnknownRightId).success,
    ).toBe(false);
  });

  it("rejects reusing the same left-column id in two pairs", () => {
    expect(
      MatchPairQuestionSchema.safeParse(invalidMatchPairReusedLeftId).success,
    ).toBe(false);
  });

  it("rejects a column entry with neither text nor image", () => {
    const result = MatchPairQuestionSchema.safeParse({
      ...validMatchPair,
      leftColumn: [{ id: "dog" }, validMatchPair.leftColumn[1]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    const result = MatchPairQuestionSchema.safeParse({
      ...validMatchPair,
      schemaVersion: 2,
    });
    expect(result.success).toBe(false);
  });

  it("accepts six entries per column, matching the match activity", () => {
    const filler = (id: string) => ({ id, text: { en: id, bn: id } });
    const result = MatchPairQuestionSchema.safeParse({
      ...validMatchPair,
      leftColumn: [
        ...validMatchPair.leftColumn,
        filler("cow"),
        filler("duck"),
        filler("goat"),
        filler("hen"),
      ],
      rightColumn: [
        ...validMatchPair.rightColumn,
        filler("moo"),
        filler("quack"),
        filler("bleat"),
        filler("cluck"),
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects seven entries in a column", () => {
    const filler = (id: string) => ({ id, text: { en: id, bn: id } });
    const result = MatchPairQuestionSchema.safeParse({
      ...validMatchPair,
      leftColumn: [
        ...validMatchPair.leftColumn,
        filler("cow"),
        filler("duck"),
        filler("goat"),
        filler("hen"),
        filler("pig"),
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("DragAnswerQuestionSchema", () => {
  it("parses a valid drag-answer question", () => {
    expect(DragAnswerQuestionSchema.parse(validDragAnswer)).toEqual(
      validDragAnswer,
    );
  });

  it("rejects a sentence with no {blank} token in one locale", () => {
    expect(
      DragAnswerQuestionSchema.safeParse(invalidDragAnswerMissingBlank).success,
    ).toBe(false);
  });

  it("rejects a sentence with two {blank} tokens", () => {
    expect(
      DragAnswerQuestionSchema.safeParse(invalidDragAnswerTwoBlanks).success,
    ).toBe(false);
  });

  it("rejects a correctOptionId that is not among the options", () => {
    const result = DragAnswerQuestionSchema.safeParse({
      ...validDragAnswer,
      correctOptionId: "purple",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    const result = DragAnswerQuestionSchema.safeParse({
      ...validDragAnswer,
      schemaVersion: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("PictureSelectQuestionSchema", () => {
  it("parses a valid picture-select question", () => {
    expect(PictureSelectQuestionSchema.parse(validPictureSelect)).toEqual(
      validPictureSelect,
    );
  });

  it("rejects an option without an image", () => {
    expect(
      PictureSelectQuestionSchema.safeParse(invalidPictureSelectMissingImage)
        .success,
    ).toBe(false);
  });

  it("rejects a correctOptionId that is not among the options", () => {
    expect(
      PictureSelectQuestionSchema.safeParse(invalidPictureSelectBadCorrectId)
        .success,
    ).toBe(false);
  });

  it("rejects an option image that is not an image asset", () => {
    const result = PictureSelectQuestionSchema.safeParse({
      ...validPictureSelect,
      options: [
        {
          id: "triangle",
          image: {
            kind: "audio",
            url: "https://cdn.kidlearn.test/images/triangle.png",
          },
        },
        validPictureSelect.options[1],
        validPictureSelect.options[2],
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a schemaVersion other than 1", () => {
    const result = PictureSelectQuestionSchema.safeParse({
      ...validPictureSelect,
      schemaVersion: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("parseQuizQuestion", () => {
  it.each(
    VALID_QUIZ_FIXTURES,
  )("parses a valid %s question through the union", (_type, fixture) => {
    expect(parseQuizQuestion(fixture)).toEqual(fixture);
  });

  it("lists every type the union accepts in QUIZ_QUESTION_TYPES", () => {
    const acceptedTypes = VALID_QUIZ_FIXTURES.map(
      ([, fixture]) => parseQuizQuestion(fixture).type,
    );
    expect([...QUIZ_QUESTION_TYPES].sort()).toEqual(acceptedTypes.sort());
  });

  it("narrows the parsed value on the type discriminant", () => {
    const question = parseQuizQuestion(validDragAnswer);
    if (question.type !== "drag_answer") {
      throw new Error("expected a drag_answer question");
    }
    expect(question.sentence.en).toContain("{blank}");
  });

  it("throws ZodError for an unknown question type", () => {
    expect(() => parseQuizQuestion(invalidQuizUnknownType)).toThrow(ZodError);
  });

  it("throws ZodError for a null payload", () => {
    expect(() => parseQuizQuestion(null)).toThrow(ZodError);
  });

  it("returns issues instead of throwing when safe-parsing invalid input", () => {
    const result = safeParseQuizQuestion(invalidMcqBadCorrectId);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected the parse to fail");
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });

  it("succeeds when safe-parsing valid input", () => {
    expect(safeParseQuizQuestion(validMcq).success).toBe(true);
  });
});
