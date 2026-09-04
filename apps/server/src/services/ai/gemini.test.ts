// Illustration prompt assembly (file 36, FR-AI-05, FR-AI-09).

import { describe, expect, it } from "vitest";
import { buildIllustrationPrompt } from "./gemini.js";

const RABBIT = {
  name: "Nibbles",
  description:
    "a small white rabbit with one grey ear, wearing a red scarf, about knee-high to a child",
};

const OWL = {
  name: "Professor Hoot",
  description: "a round brown owl with large round glasses and a green bow tie",
};

describe("the style prefix", () => {
  it("comes first, before the characters and the scene", async () => {
    // Not decoration: an image model weights its earliest instructions most, and
    // the prefix is what makes two pictures drawn a month apart belong to the same
    // product.
    const prompt = buildIllustrationPrompt("A rabbit hops across a meadow", [
      RABBIT,
    ]);

    expect(prompt.startsWith("Children's book illustration")).toBe(true);
  });

  it("is present even with no character sheets", () => {
    const prompt = buildIllustrationPrompt("An empty meadow at dawn");

    expect(prompt).toContain("suitable for ages 3-6");
  });

  it("forbids text in the image", () => {
    // A blackboard of misspelled pseudo-English is worse than no picture for a
    // child learning to read; every word a child sees is translatable content.
    expect(buildIllustrationPrompt("A classroom")).toContain(
      "no text in image",
    );
  });
});

describe("the character block (FR-AI-09)", () => {
  it("puts each sheet's description ahead of the scene text", async () => {
    const prompt = buildIllustrationPrompt("Nibbles hops across a meadow", [
      RABBIT,
    ]);

    expect(prompt.indexOf(RABBIT.description)).toBeLessThan(
      prompt.indexOf("Scene: Nibbles hops across a meadow"),
    );
  });

  it("names the character alongside its description", () => {
    const prompt = buildIllustrationPrompt("Nibbles waves", [RABBIT]);

    expect(prompt).toContain(`- Nibbles: ${RABBIT.description}`);
  });

  it("instructs the model to draw them identically every time", () => {
    // Worded as an instruction rather than as context, because a description
    // offered as background is treated as a suggestion.
    expect(buildIllustrationPrompt("Nibbles waves", [RABBIT])).toContain(
      "draw EXACTLY as described, identical in every image",
    );
  });

  it("gives two pages featuring the same character an identical character block", () => {
    // This is the requirement itself: page 3 and page 7 differ only after
    // `Scene:`, so the same rabbit is described to the model both times.
    const pageThree = buildIllustrationPrompt("Nibbles finds a carrot", [
      RABBIT,
      OWL,
    ]);
    const pageSeven = buildIllustrationPrompt("Nibbles shares the carrot", [
      RABBIT,
      OWL,
    ]);

    const block = (prompt: string) => prompt.slice(0, prompt.indexOf("Scene:"));
    expect(block(pageThree)).toBe(block(pageSeven));
    expect(pageThree).not.toBe(pageSeven);
  });

  it("lists every sheet it is given, in order", () => {
    const prompt = buildIllustrationPrompt("Nibbles meets the professor", [
      RABBIT,
      OWL,
    ]);

    expect(prompt.indexOf("Nibbles:")).toBeLessThan(
      prompt.indexOf("Professor Hoot:"),
    );
  });

  it("omits the heading entirely when there are no sheets", () => {
    // A heading with nothing under it tells the model there are characters it has
    // not been told about.
    const prompt = buildIllustrationPrompt("An empty meadow at dawn");

    expect(prompt).not.toContain("Recurring characters");
    expect(prompt).toContain("Scene: An empty meadow at dawn");
  });
});
