/**
 * The lazily-constructed Gemini client (file 36, FR-AI-05).
 *
 * Its own file rather than an addition to `gemini.test.ts`, which is deliberately
 * mock-free: `buildIllustrationPrompt` is a pure function and asserting it needs
 * no SDK. What is under test here is the memoisation, which needs one.
 *
 * The claim is narrow and easy to lose in a refactor: the client promise is cached
 * so a sixteen-page batch resolves the module once, but a *rejection* must not be.
 * `??=` reassigns only on `undefined`, so caching a failure would make one bad
 * module evaluation — protobufjs running out of memory on the free-tier instance
 * this laziness exists for — permanent, failing every later illustration with a
 * stale error and burning the daily image cap until somebody restarted the process.
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
