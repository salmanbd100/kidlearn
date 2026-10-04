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

  it("bounds every provider call, so a hung connection cannot hold a job open", async () => {
    const { generateIllustration } = await import("./gemini.js");
    sdk.generateContent.mockResolvedValue(imagePart);

    await generateIllustration("A rabbit in a meadow");

    expect(sdk.construct.mock.calls[0][0].httpOptions.timeout).toBeGreaterThan(
      0,
    );
  });

  it("applies the child-safety thresholds to the illustration model too", async () => {
    const { generateIllustration } = await import("./gemini.js");
    sdk.generateContent.mockResolvedValue(imagePart);

    await generateIllustration("A rabbit in a meadow");

    const { config } = sdk.generateContent.mock.calls[0][0];
    expect(config.safetySettings).toHaveLength(4);
    expect(config.safetySettings[0].threshold).toBe("BLOCK_LOW_AND_ABOVE");
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
