import { validDragDrop } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import { evaluateDrop, isActivityComplete } from "./evaluate";

describe("evaluateDrop", () => {
  it("accepts a pair the definition maps to each other", () => {
    expect(evaluateDrop(validDragDrop, "cow", "farm")).toBe(true);
    expect(evaluateDrop(validDragDrop, "fish", "pond")).toBe(true);
  });

  it("rejects a pair the definition swaps", () => {
    expect(evaluateDrop(validDragDrop, "cow", "pond")).toBe(false);
    expect(evaluateDrop(validDragDrop, "fish", "farm")).toBe(false);
  });

  it("rejects an item the definition has never heard of", () => {
    expect(evaluateDrop(validDragDrop, "dragon", "farm")).toBe(false);
  });

  it("rejects a target the definition has never heard of", () => {
    expect(evaluateDrop(validDragDrop, "cow", "moon")).toBe(false);
  });

  it("rejects the empty string rather than matching a blank mapping", () => {
    expect(evaluateDrop(validDragDrop, "", "")).toBe(false);
  });
});

describe("isActivityComplete", () => {
  it("is false with nothing placed", () => {
    expect(isActivityComplete(validDragDrop, {})).toBe(false);
  });

  it("is false while one mapping is still open", () => {
    expect(isActivityComplete(validDragDrop, { cow: "farm" })).toBe(false);
  });

  it("is true once every mapping has been placed", () => {
    expect(
      isActivityComplete(validDragDrop, { cow: "farm", fish: "pond" }),
    ).toBe(true);
  });
});
