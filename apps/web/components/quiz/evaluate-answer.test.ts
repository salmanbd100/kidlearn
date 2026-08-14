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

  describe("the formats file 22 owns", () => {
    it("refuses to mark a drag_answer rather than guessing at it", () => {
      expect(() => evaluateAnswer(validDragAnswer, "blue")).toThrow(
        /drag_answer/,
      );
    });

    it("refuses to mark a match_pair rather than guessing at it", () => {
      expect(() =>
        evaluateAnswer(validMatchPair, {
          pairs: [{ leftId: "dog", rightId: "woof" }],
        }),
      ).toThrow(/match_pair/);
    });
  });
});
