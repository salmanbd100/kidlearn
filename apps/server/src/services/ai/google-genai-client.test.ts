/**
 * The lazily-constructed `@google/genai` client, shared by the text generators
 * and the illustration model (files 36, 37a).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generateContent };
    constructor(options: { apiKey: string }) {
      sdk.construct(options);
    }
  },
}));

const imagePart = {
  candidates: [{ content: { parts: [{ inlineData: { data: "aGVsbG8=" } }] } }],
};

beforeEach(() => {
  vi.resetModules();
  sdk.construct.mockReset();
  sdk.generateContent.mockReset();
});

describe("client construction", () => {
  it("builds the client once for a whole batch", async () => {
    const { generateIllustration } = await import("./gemini.js");
    sdk.generateContent.mockResolvedValue(imagePart);

    await generateIllustration("A rabbit in a meadow");
    await generateIllustration("The same rabbit, later");

    expect(sdk.construct).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed construction", async () => {
    // The regression this file exists for. A transient module-evaluation failure
    // must not disable illustrations for the lifetime of the process.
    sdk.construct.mockImplementationOnce(() => {
      throw new Error("Cannot allocate memory");
    });
    const { generateIllustration } = await import("./gemini.js");

    await expect(generateIllustration("A rabbit")).rejects.toThrow(
      /Cannot allocate memory/,
    );

    sdk.generateContent.mockResolvedValue(imagePart);
    await expect(generateIllustration("A rabbit")).resolves.toBeInstanceOf(
      Buffer,
    );
    expect(sdk.construct).toHaveBeenCalledTimes(2);
  });
});
