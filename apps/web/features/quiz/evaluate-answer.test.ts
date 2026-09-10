import {
  validDragAnswer,
  validMatchPair,
  validMcq,
  validPictureSelect,
} from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "./evaluate-answer";

describe("evaluateAnswer", () => {
  describe("mcq (FR-QUIZ-01)", () => {
    it("accepts the option the payload names as correct", () => {
      expect(evaluateAnswer(validMcq, "apple")).toBe(true);
    });

    it("rejects any other option on the card", () => {
      expect(evaluateAnswer(validMcq, "leaf")).toBe(false);
      expect(evaluateAnswer(validMcq, "sky")).toBe(false);
    });

    it("rejects an id that is not on the question at all", () => {
      expect(evaluateAnswer(validMcq, "banana")).toBe(false);
    });

    it("rejects a pairs answer handed to a pick-one question", () => {
      expect(
        evaluateAnswer(validMcq, {
          pairs: [{ leftId: "apple", rightId: "apple" }],
        }),
      ).toBe(false);
    });
  });

  describe("picture_select (FR-QUIZ-04)", () => {
    it("accepts the picture the payload names as correct", () => {
      expect(evaluateAnswer(validPictureSelect, "triangle")).toBe(true);
    });

    it("rejects the other pictures", () => {
      expect(evaluateAnswer(validPictureSelect, "circle")).toBe(false);
      expect(evaluateAnswer(validPictureSelect, "square")).toBe(false);
    });
  });

  describe("drag_answer (FR-QUIZ-03)", () => {
    it("accepts the option the payload names as correct", () => {
      expect(evaluateAnswer(validDragAnswer, "blue")).toBe(true);
    });

    it("rejects the other option in the tray", () => {
      expect(evaluateAnswer(validDragAnswer, "green")).toBe(false);
    });

    it("rejects an id that is not in the tray at all", () => {
      expect(evaluateAnswer(validDragAnswer, "purple")).toBe(false);
    });
  });

  describe("match_pair (FR-QUIZ-02)", () => {
    const bothPairs = [
      { leftId: "dog", rightId: "woof" },
      { leftId: "cat", rightId: "meow" },
    ];

    it("accepts every pair matched", () => {
      expect(evaluateAnswer(validMatchPair, { pairs: bothPairs })).toBe(true);
    });

    it("accepts the pairs in any order", () => {
      expect(
        evaluateAnswer(validMatchPair, { pairs: [...bothPairs].reverse() }),
      ).toBe(true);
    });

    it("accepts a pair whose sides arrive the other way round", () => {
      // Which column the child tapped first is not part of the answer.
      expect(
        evaluateAnswer(validMatchPair, {
          pairs: [
            { leftId: "woof", rightId: "dog" },
            { leftId: "meow", rightId: "cat" },
          ],
        }),
      ).toBe(true);
    });

    it("rejects a half-finished set", () => {
      expect(evaluateAnswer(validMatchPair, { pairs: [bothPairs[0]] })).toBe(
        false,
      );
    });

    it("rejects a set containing a pair that does not go together", () => {
      expect(
        evaluateAnswer(validMatchPair, {
          pairs: [
            { leftId: "dog", rightId: "meow" },
            { leftId: "cat", rightId: "woof" },
          ],
        }),
      ).toBe(false);
    });

    it("rejects one right pair sent twice in place of the missing one", () => {
      expect(
        evaluateAnswer(validMatchPair, {
          pairs: [bothPairs[0], bothPairs[0]],
        }),
      ).toBe(false);
    });

    it("rejects a pick-one answer handed to a pairing question", () => {
      expect(evaluateAnswer(validMatchPair, "dog")).toBe(false);
    });
  });
});
